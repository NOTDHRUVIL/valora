document.addEventListener('DOMContentLoaded', () => {
    const chatBox = document.getElementById('chat-box');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const optionsContainer = document.getElementById('options-container');

    // This is the main memory of the quiz. It stores the conversation history.
    let conversationHistory = [];
    let gameState = 'START'; // START, QUIZZING, END
    const MAX_QUESTIONS = 5; // End the quiz after 5 questions
    let questionCount = 0;

    const PERPLEXITY_API_KEY = "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";
    const API_URL = 'https://api.perplexity.ai/chat/completions';

    // Function to add a message to the chat UI
    const addMessage = (text, sender) => {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', `${sender}-message`);
        // Using a simple library to parse markdown for bolding, lists, etc.
        messageElement.innerHTML = marked.parse(text);
        chatBox.appendChild(messageElement);
        chatBox.scrollTop = chatBox.scrollHeight;
    };

    // Function to show the loading indicator
    const showLoading = () => {
        const loadingElement = document.createElement('div');
        loadingElement.classList.add('loading-indicator');
        loadingElement.innerHTML = '<span></span><span></span><span></span>';
        chatBox.appendChild(loadingElement);
        chatBox.scrollTop = chatBox.scrollHeight;
    };

    // Function to hide the loading indicator
    const hideLoading = () => {
        const loadingElement = chatBox.querySelector('.loading-indicator');
        if (loadingElement) {
            chatBox.removeChild(loadingElement);
        }
    };

    // The main function to call the Perplexity API
    const callPerplexityAPI = async (messages) => {
        showLoading();
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'sonar-pro', // A powerful model for good quality responses
                    messages: messages,
                    // Using structured output to get a reliable JSON response
                    response_format: { type: "json_object" },
                })
            });

            if (!response.ok) {
                throw new Error(`API request failed with status ${response.status}`);
            }

            const data = await response.json();
            // The actual content is a JSON string, so we need to parse it again
            const content = JSON.parse(data.choices[0].message.content);
            return content;

        } catch (error) {
            console.error("Error calling Perplexity API:", error);
            return { response: "Sorry, I ran into an error. Please try again." };
        } finally {
            hideLoading();
        }
    };

    const handleUserInput = async () => {
        const userText = userInput.value.trim();
        if (!userText) return;

        addMessage(userText, 'user');
        userInput.value = '';
        userInput.disabled = true;
        sendBtn.disabled = true;

        if (gameState === 'START') {
            // --- Phase 1: Starting the Quiz ---
            conversationHistory.push({ role: 'user', content: `My topic of interest is: ${userText}` });
            
            // This is the initial prompt to kick off the quiz.
            const initialSystemPrompt = {
                role: 'system',
                content: `You are an AI assistant for a quiz game called "Curiosity Compass". Your goal is to help a user explore a topic they are curious about by asking a series of questions, like the game Akinator.
                1. The user will provide their topic of interest.
                2. Your first task is to ask an engaging, open-ended question about that topic to start the quiz.
                3. You MUST respond in a JSON format with a single key "response" containing your question. Example: {"response": "That's a fascinating topic! What specific area of it sparks your curiosity the most?"}`
            };

            const apiResponse = await callPerplexityAPI([initialSystemPrompt, ...conversationHistory]);
            
            addMessage(apiResponse.response, 'bot');
            conversationHistory.push({ role: 'assistant', content: apiResponse.response });
            gameState = 'QUIZZING';
            userInput.placeholder = "Your answer...";

        } else if (gameState === 'QUIZZING') {
            // --- Phase 2: The Question-Answer Loop ---
            questionCount++;
            conversationHistory.push({ role: 'user', content: userText });

            if (questionCount >= MAX_QUESTIONS) {
                // --- Reached the end of the quiz, now generate the summary ---
                await generateFinalSummary();
            } else {
                // This prompt asks the API to generate the *next* question based on the history.
                const quizzingSystemPrompt = {
                    role: 'system',
                    content: `You are a quiz master for "Curiosity Compass". Based on the conversation history, your task is to ask the next question to progressively narrow down the topic, like Akinator. Keep the user engaged.
                    You MUST respond in a JSON format with a single key "response" containing your next question. Example: {"response": "Interesting! And what about that do you find most compelling?"}`
                };
                
                const apiResponse = await callPerplexityAPI([quizzingSystemPrompt, ...conversationHistory]);
                
                addMessage(apiResponse.response, 'bot');
                conversationHistory.push({ role: 'assistant', content: apiResponse.response });
            }
        }
        
        userInput.disabled = false;
        sendBtn.disabled = false;
        userInput.focus();
    };
    
    // --- Phase 3: Generating the Final Analysis ---
    const generateFinalSummary = async () => {
        gameState = 'END';
        userInput.placeholder = "Quiz finished! A new chat will start on your next message.";
        document.getElementById('input-container').classList.add('hidden'); // Hide input for final summary
        
        // This is the most creative and powerful prompt. It asks the API to do three things at once.
        const finalSystemPrompt = {
            role: 'system',
            content: `You are a learning analyst AI. You have just completed a quiz session with a user. Your final task is to analyze the entire conversation history provided.
            Based on the history, you must do three things:
            1.  **Create a concise summary** of the specific sub-topic that was ultimately explored during the quiz.
            2.  **Generate a "Personalized Learning Summary"** for the user. Infer what they seemed to understand well and what areas might be new to them based on their answers.
            3.  **Use your real-time search capabilities** to find 2-3 high-quality, relevant articles or resources that the user can use to "Dig Deeper" into the topic. Provide the real URLs.

            You MUST respond in a valid JSON format with the following structure:
            {
              "summary": "A string containing the topic summary.",
              "learningModel": {
                "strengths": "A string explaining what the user seems to understand well.",
                "opportunities": "A string suggesting areas for further learning."
              },
              "digDeeper": [
                { "title": "Title of the first resource", "url": "URL for the first resource" },
                { "title": "Title of the second resource", "url": "URL for the second resource" }
              ]
            }`
        };

        const finalResponse = await callPerplexityAPI([finalSystemPrompt, ...conversationHistory]);

        // Display the final, structured summary in a user-friendly way
        let summaryHTML = `
            <div class="summary-card">
                <h3>Topic Summary</h3>
                <p>${finalResponse.summary}</p>
            </div>
            <div class="summary-card">
                <h3>Your Learning Journey</h3>
                <p><b>What you seem to grasp well:</b> ${finalResponse.learningModel.strengths}</p>
                <p><b>Areas to explore next:</b> ${finalResponse.learningModel.opportunities}</p>
            </div>
            <div class="summary-card">
                <h3>Dig Deeper</h3>
                <ul>
                    ${finalResponse.digDeeper.map(item => `<li><a href="${item.url}" target="_blank">${item.title}</a></li>`).join('')}
                </ul>
            </div>
        `;
        
        addMessage(summaryHTML, 'bot');
        optionsContainer.classList.remove('hidden');
    };

    // Initial greeting from the bot
    addMessage("Hello! I'm your Curiosity Compass. What topic are you curious about today?", 'bot');

    sendBtn.addEventListener('click', handleUserInput);
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleUserInput();
        }
    });

    // We need to add the 'marked' library to parse markdown in the final summary.
    // Add this script tag to your index.html head:
    // <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
});
