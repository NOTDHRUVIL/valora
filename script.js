// disable this key after the event is over.
const PERPLEXITY_API_KEY = "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";

const API_URL = 'https://api.perplexity.ai/chat/completions';

// --- State Management ---
let gameState = 'start';
let topic = '';
let history = [];
let currentQuestion = null;
let selectedOptionIndex = null;
const MAX_QUESTIONS = 5;

// --- DOM Elements ---
const startScreen = document.getElementById('start-screen');
const quizScreen = document.getElementById('quiz-screen');
const summaryScreen = document.getElementById('summary-screen');

const topicForm = document.getElementById('topic-form');
const topicInput = document.getElementById('topic-input');
const startBtn = document.getElementById('start-btn');

const questionNumberEl = document.getElementById('question-number');
const questionTextEl = document.getElementById('question-text');
const optionsGridEl = document.getElementById('options-grid');
const submitBtn = document.getElementById('submit-btn');
const nextBtn = document.getElementById('next-btn');
const explanationEl = document.getElementById('explanation');
const endQuizBtn = document.getElementById('end-quiz-btn');

const summaryContentEl = document.getElementById('summary-content');
const restartBtn = document.getElementById('restart-btn');

// --- API Helper ---
const quizSchema = {
    type: 'object',
    properties: {
        question_text: { type: 'string' },
        options: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },
        correct_option_index: { type: 'integer' },
        explanation: { type: 'string' },
    },
    required: ['question_text', 'options', 'correct_option_index', 'explanation'],
};

async function callPerplexityAPI(messages, model, useSchema = false) {
    const payload = {
        model: model,
        messages: messages,
    };
    if (useSchema) {
        payload.response_format = { type: 'json_schema', json_schema: { schema: quizSchema } };
    }

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error.message || 'API request failed');
        }

        const data = await response.json();
        return data.choices[0].message.content;
    } catch (error) {
        console.error("API Error:", error);
        alert(`An error occurred: ${error.message}. Please check the console.`);
        return null;
    }
}

// --- UI Logic ---
function showScreen(screenName) {
    startScreen.classList.add('hidden');
    quizScreen.classList.add('hidden');
    summaryScreen.classList.add('hidden');
    document.getElementById(`${screenName}-screen`).classList.remove('hidden');
}

function renderQuestion() {
    questionNumberEl.textContent = `Question ${history.length + 1} of ${MAX_QUESTIONS}`;
    questionTextEl.textContent = currentQuestion.question_text;
    optionsGridEl.innerHTML = '';
    
    currentQuestion.options.forEach((option, index) => {
        const button = document.createElement('button');
        button.className = 'option-btn';
        button.textContent = option;
        button.dataset.index = index;
        button.onclick = () => {
            if (submitBtn.disabled) return;
            selectedOptionIndex = index;
            // Visually mark selection
            document.querySelectorAll('.option-btn').forEach(btn => btn.classList.remove('selected'));
            button.classList.add('selected');
            submitBtn.disabled = false;
        };
        optionsGridEl.appendChild(button);
    });
}

// --- Game Logic ---
async function handleStartQuiz(e) {
    e.preventDefault();
    topic = topicInput.value.trim();
    if (!topic) return;

    startBtn.textContent = 'Starting...';
    startBtn.disabled = true;

    const messages = [
        { role: 'system', content: `You are an AI quiz master. Always respond in the requested JSON format.` },
        { role: 'user', content: `The user wants a quiz on "${topic}". Generate the very first question.` },
    ];

    const responseContent = await callPerplexityAPI(messages, 'sonar-pro', true);
    
    if (responseContent) {
        currentQuestion = JSON.parse(responseContent);
        history = [];
        showScreen('quiz');
        renderQuestion();
    }
    startBtn.textContent = 'Start Quiz';
    startBtn.disabled = false;
}

async function handleNextQuestion() {
    if (history.length >= MAX_QUESTIONS) {
        handleEndQuiz();
        return;
    }

    // Reset UI for next question
    nextBtn.classList.add('hidden');
    explanationEl.classList.add('hidden');
    submitBtn.disabled = true;
    questionTextEl.textContent = "Generating next question...";
    optionsGridEl.innerHTML = '';

    const messages = [
        { role: 'system', content: `You are an AI quiz master. Always respond in the requested JSON format.` }
    ];
    history.forEach(turn => {
        messages.push({ role: 'assistant', content: `Question: ${turn.question_text}` });
        messages.push({ role: 'user', content: `I answered "${turn.userAnswer}". This was ${turn.isCorrect ? 'correct' : 'incorrect'}.` });
    });
    messages.push({ role: 'user', content: 'Based on our conversation so far, generate the next logical question.' });

    const responseContent = await callPerplexityAPI(messages, 'sonar-pro', true);
    if (responseContent) {
        currentQuestion = JSON.parse(responseContent);
        renderQuestion();
    }
}

async function handleEndQuiz() {
    showScreen('summary');
    const transcript = history.map(turn => 
        `Q: ${turn.question_text}\nYour Answer: ${turn.userAnswer} (${turn.isCorrect ? 'Correct' : 'Incorrect'})\nCorrect Answer: ${turn.options[turn.correct_option_index]}\n`
    ).join('\n');

    const messages = [
        { role: 'system', content: "You are an AI learning coach. Analyze the user's quiz performance and provide a detailed, encouraging summary in Markdown." },
        { role: 'user', content: `The quiz on "${topic}" has ended. Here is the transcript:\n\n${transcript}\n\nProvide a learning analysis with these sections:\n\n### Summary of Topics\n\n### Your Learning Analysis\n\n### What You've Learned` },
    ];

    const summary = await callPerplexityAPI(messages, 'sonar-deep-research');
    if (summary) {
        summaryContentEl.innerHTML = marked.parse(summary);
    }
}

function handleSubmitAnswer() {
    submitBtn.disabled = true;
    document.querySelectorAll('.option-btn').forEach(btn => {
        const index = parseInt(btn.dataset.index);
        if (index === currentQuestion.correct_option_index) {
            btn.classList.add('correct');
        } else if (index === selectedOptionIndex) {
            btn.classList.add('incorrect');
        }
    });

    explanationEl.innerHTML = `<strong>Explanation:</strong> ${currentQuestion.explanation}`;
    explanationEl.classList.remove('hidden');
    nextBtn.classList.remove('hidden');
    
    // Add to history
    const turnData = {
        ...currentQuestion,
        userAnswer: currentQuestion.options[selectedOptionIndex],
        isCorrect: selectedOptionIndex === currentQuestion.correct_option_index,
    };
    history.push(turnData);

    if (history.length >= MAX_QUESTIONS) {
        nextBtn.textContent = "Finish & See Summary";
    }
}

function handleRestart() {
    topic = '';
    history = [];
    currentQuestion = null;
    selectedOptionIndex = null;
    topicInput.value = '';
    summaryContentEl.innerHTML = '<p class="loading-text">Analyzing your results...</p>';
    nextBtn.textContent = "Next Question";
    showScreen('start');
}

// --- Event Listeners ---
topicForm.addEventListener('submit', handleStartQuiz);
submitBtn.addEventListener('click', handleSubmitAnswer);
nextBtn.addEventListener('click', handleNextQuestion);
endQuizBtn.addEventListener('click', handleEndQuiz);
restartBtn.addEventListener('click', handleRestart);
