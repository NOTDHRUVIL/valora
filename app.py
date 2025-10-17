import streamlit as st
from perplexity import Perplexity
import json
import toml
import os

# --- 1. CONFIGURATION & INITIALIZATION ---

# Set Streamlit page configuration
st.set_page_config(
    page_title="Curiosity Quiz",
    page_icon="🧠",
    layout="centered",
    initial_sidebar_state="collapsed",
)

# --- Securely load the API key ---
api_key = None
try:
    # Preferred method: Load from Streamlit's secrets manager (for deployment)
    api_key = st.secrets["PERPLEXITY_API_KEY"]
except (FileNotFoundError, KeyError):
    # Fallback method: Load from a local secrets.toml file (for local development)
    try:
        with open("secrets.toml", "r") as f:
            secrets = toml.load(f)
            api_key = secrets.get("PERPLEXITY_API_KEY")
    except FileNotFoundError:
        pass # If no file is found, api_key remains None

# If the API key is still not found, display an error and stop the app.
if not api_key:
    st.error("Perplexity API key not found. Please add it to your Streamlit secrets or a local `secrets.toml` file.")
    st.stop()

# Initialize the Perplexity client with the loaded key
client = Perplexity(api_key=api_key)


# Define the JSON schema for quiz questions to ensure consistent API responses
quiz_schema = {
    'type': 'object',
    'properties': {
        'question_text': {'type': 'string'},
        'options': {'type': 'array', 'items': {'type': 'string'}, 'minItems': 4, 'maxItems': 4},
        'correct_option_index': {'type': 'integer', 'minimum': 0, 'maximum': 3},
        'explanation': {'type': 'string'},
    },
    'required': ['question_text', 'options', 'correct_option_index', 'explanation'],
}

# Initialize session state variables
if 'game_state' not in st.session_state:
    st.session_state.game_state = 'start'
    st.session_state.topic = ''
    st.session_state.history = []
    st.session_state.current_question = None
    st.session_state.selected_option = None
    st.session_state.is_answered = False
    st.session_state.error = None

# --- 2. API HELPER FUNCTION ---

def get_perplexity_response(messages, model, response_format=None):
    """Generic function to call the Perplexity API and handle errors."""
    try:
        params = {"model": model, "messages": messages}
        if response_format:
            params["response_format"] = response_format
        
        response = client.chat.completions.create(**params)
        return response.choices[0].message.content
    except Exception as e:
        st.session_state.error = f"API Error: {e}"
        return None

# --- 3. CORE GAME LOGIC FUNCTIONS ---

def start_quiz(topic):
    """Starts the quiz by fetching the first question."""
    st.session_state.topic = topic
    st.session_state.history = []
    
    messages = [
        {'role': 'system', 'content': 'You are an AI quiz master. Generate multiple-choice questions for a quiz. Always respond in the requested JSON format.'},
        {'role': 'user', 'content': f'The user wants a quiz on "{topic}". Generate the very first question.'},
    ]
    
    with st.spinner("Generating first question..."):
        response_content = get_perplexity_response(messages, 'sonar-pro', {'type': 'json_schema', 'json_schema': {'schema': quiz_schema}})
        
        if response_content:
            st.session_state.current_question = json.loads(response_content)
            st.session_state.game_state = 'quiz'
            reset_turn_state()

def next_question():
    """Fetches the next question based on the quiz history."""
    turn_data = {
        **st.session_state.current_question,
        'user_answer': st.session_state.current_question['options'][st.session_state.selected_option],
        'is_correct': st.session_state.selected_option == st.session_state.current_question['correct_option_index'],
    }
    st.session_state.history.append(turn_data)
    
    if len(st.session_state.history) >= 5: # End quiz after 5 questions
        end_quiz()
        return

    messages = [{'role': 'system', 'content': 'You are an AI quiz master. Always respond in the requested JSON format.'}]
    for turn in st.session_state.history:
        messages.append({'role': 'assistant', 'content': f"Question: {turn['question_text']}"})
        messages.append({'role': 'user', 'content': f"I answered \"{turn['user_answer']}\". This was {'correct' if turn['is_correct'] else 'incorrect'}."})
    
    messages.append({'role': 'user', 'content': 'Based on our conversation, generate the next logical question.'})

    with st.spinner("Generating next question..."):
        response_content = get_perplexity_response(messages, 'sonar-pro', {'type': 'json_schema', 'json_schema': {'schema': quiz_schema}})

        if response_content:
            st.session_state.current_question = json.loads(response_content)
            reset_turn_state()

def end_quiz():
    """Ends the quiz and fetches the summary."""
    st.session_state.game_state = 'summary'
    
    transcript = "\n".join(
        f"Q: {turn['question_text']}\nYour Answer: {turn['user_answer']} ({'Correct' if turn['is_correct'] else 'Incorrect'})\nCorrect Answer: {turn['options'][turn['correct_option_index']]}\n"
        for turn in st.session_state.history
    )
    
    messages = [
        {'role': 'system', 'content': "You are an AI learning coach. Analyze the user's quiz performance and provide a detailed, encouraging summary in Markdown."},
        {'role': 'user', 'content': f'The quiz on "{st.session_state.topic}" has ended. Here is the transcript:\n\n{transcript}\n\nProvide a learning analysis with these sections:\n\n### Summary of Topics\n\n### Your Learning Analysis\n\n### What You\'ve Learned'},
    ]

    with st.spinner("Analyzing your results..."):
        summary_content = get_perplexity_response(messages, 'sonar-deep-research')
        if summary_content:
            st.session_state.current_question = {'summary': summary_content}

def restart_game():
    """Resets the entire game state."""
    st.session_state.game_state = 'start'
    st.session_state.topic = ''
    st.session_state.history = []
    st.session_state.current_question = None
    reset_turn_state()

def reset_turn_state():
    """Resets the state for a single question turn."""
    st.session_state.selected_option = None
    st.session_state.is_answered = False
    st.session_state.error = None

# --- 4. UI RENDERING ---

st.title("🧠 Curiosity Quiz")

if st.session_state.error:
    st.error(st.session_state.error)
    if st.button("Try Again"):
        restart_game()
        st.rerun()
else:
    if st.session_state.game_state == 'start':
        st.write("What are you curious about today?")
        with st.form("topic_form"):
            topic_input = st.text_input("Enter a topic", placeholder="e.g., The History of Space Exploration", label_visibility="collapsed")
            submitted = st.form_submit_button("Start Quiz", use_container_width=True, type="primary")
            if submitted and topic_input:
                start_quiz(topic_input)
                st.rerun()

    elif st.session_state.game_state == 'quiz' and st.session_state.current_question:
        q = st.session_state.current_question
        question_number = len(st.session_state.history) + 1
        
        st.header(f"Question {question_number} of 5")
        st.markdown(f"#### {q['question_text']}")
        st.divider()

        options = q['options']
        if st.session_state.is_answered:
            for i, option in enumerate(options):
                is_correct = (i == q['correct_option_index'])
                is_selected_and_wrong = (i == st.session_state.selected_option and not is_correct)
                label = f"{'✅' if is_correct else '❌'} {option}"
                st.button(label, disabled=True, key=f"answered_{i}")

            if st.session_state.selected_option == q['correct_option_index']:
                st.success(f"Correct! {q['explanation']}")
            else:
                st.error(f"Incorrect. {q['explanation']}")
            
            if st.button("Next Question" if question_number < 5 else "Finish Quiz", use_container_width=True, type="primary"):
                next_question()
                st.rerun()
        else:
            selected_option = st.radio("Choose your answer:", options, index=None, key="options_radio")
            if st.button("Submit", use_container_width=True, type="primary"):
                if selected_option is not None:
                    st.session_state.selected_option = options.index(selected_option)
                    st.session_state.is_answered = True
                    st.rerun()
                else:
                    st.warning("Please select an answer.")

    elif st.session_state.game_state == 'summary' and st.session_state.current_question:
        st.header("Quiz Summary")
        st.markdown(st.session_state.current_question['summary'])
        
        col1, col2 = st.columns(2)
        with col1:
            st.button("Dig Deeper (V2)", on_click=lambda: st.toast("This feature is coming in V2!"), use_container_width=True)
        with col2:
            st.button("Start a New Quiz", on_click=restart_game, type="primary", use_container_width=True)
