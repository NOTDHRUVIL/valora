document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const chatBox = document.getElementById('chat-box');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const optionsContainer = document.getElementById('options-container');
    const exploreBtn = document.getElementById('explore-btn');

    // State Management
    let conversationHistory = [];
    let performanceLog = []; // Tracks user's right/wrong answers
    let currentCorrectAnswer = "";
    let lastQuestion = "";
    let currentDifficulty = "easy"; // 'easy', 'medium', 'hard'
    let gameState = 'START'; // START, AWAITING_ANSWER, END
    const MAX_QUESTIONS = 5;
    let questionCount = 0;

    // API Configuration
    const PERPLEXITY_API_KEY = "YOUR_PERPLEXITY_API_KEY";
    const API_URL = 'https://api.perplexity.ai/chat/completions';

    // --- UI Helper Functions ---
    const addMessage = (html, sender, feedbackType = '') => {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', `${sender}-message`);
        if (feedbackType) {
            messageElement.classList.add('feedback-message', `feedback-${feedbackType}`);
        }
        messageElement.innerHTML = marked.parse(html);
        chatBox.appendChild(messageElement);
        chatBox.scrollTop = chatBox.scrollHeight;
    };
    const showLoading = () => { /* ... (same as before) ... */ };
    const hideLoading = () => { /* ... (same as before) ... */ };
    const toggleInput = (enabled) => {
        userInput.disabled = !enabled;
        sendBtn.disabled = !enabled;
        if (enabled) userInput.focus();
    };

    // --- Core API Function ---
    const callPerplexityAPI = async (messages, model = 'sonar-pro') => {
        showLoading();
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${PERPLEXITY_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model, messages, response_format: { type: "json_object" } })
            });
            if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
            const data = await response.json();
            return JSON.parse(data.choices[0].message.content);
        } catch (error) {
            console.error("API call failed:", error);
            addMessage("I'm having trouble connecting right now. Please try again in a moment.", 'bot');
            return null;
        } finally {
            hideLoading();
        }
    };

    // --- Quiz Logic Functions ---
    const startQuiz = async (topic) => {
        conversationHistory.push({ role: 'user', content: `Start a quiz on the topic: ${topic}` });
        addMessage(`Great! Let's dive into **${topic}**. Here is your first question:`, 'bot');
        await generateNextQuestion();
    };

    const generateNextQuestion = async () => {
        questionCount++;
        const systemPrompt = {
            role: 'system',
            content: `You are a quiz master. Your task is to generate a quiz question about the topic based on the conversation history.
            The user's performance on the previous question is logged. Adjust the difficulty of the new question accordingly:
            - If they were correct, make the next question slightly harder.
            - If they were incorrect, make it slightly easier or cover a related foundational concept.
            - The current difficulty level is '${currentDifficulty}'.
            You MUST respond in a JSON format with two keys: "question" (the quiz question) and "answer" (a concise, correct answer to the question).`
        };
        const apiResponse = await callPerplexityAPI([systemPrompt, ...conversationHistory]);
        if (apiResponse) {
            lastQuestion = apiResponse.question;
            currentCorrectAnswer = apiResponse.answer;
            addMessage(lastQuestion, 'bot');
            conversationHistory.push({ role: 'assistant', content: `Question: ${lastQuestion}` });
            gameState = 'AWAITING_ANSWER';
            toggleInput(true);
            userInput.placeholder = "Your answer...";
        }
    };

    const evaluateAnswer = async (userAnswer) => {
        const systemPrompt = {
            role: 'system',
            content: `You are a helpful tutor. A user has answered a quiz question.
            The question was: "${lastQuestion}"
            The correct answer is: "${currentCorrectAnswer}"
            The user's answer was: "${userAnswer}"
            Your task is to evaluate if the user's answer is correct. Be lenient with phrasing.
            Then, provide brief, encouraging, and educational feedback.
            You MUST respond in a JSON format: {"evaluation": "correct" | "incorrect", "feedback": "Your feedback here."}`
        };
        const apiResponse = await callPerplexityAPI([systemPrompt], 'sonar-pro');
        if (apiResponse) {
            addMessage(apiResponse.feedback, 'bot', apiResponse.evaluation);
            
            // Log performance and adjust difficulty
            performanceLog.push({ question: lastQuestion, userAnswer, result: apiResponse.evaluation });
            if (apiResponse.evaluation === 'correct') {
                currentDifficulty = (currentDifficulty === 'easy') ? 'medium' : 'hard';
            } else {
                currentDifficulty = (currentDifficulty === 'hard') ? 'medium' : 'easy';
            }
        }
        return apiResponse;
    };

    const generateFinalSummary = async () => {
        gameState = 'END';
        toggleInput(false);
        userInput.placeholder = "Quiz complete!";
        
        const systemPrompt = {
            role: 'system',
            content: `You are a learning analyst AI. The quiz is over. Analyze the entire conversation and the performance log provided.
            Your task is to generate a comprehensive educational summary.
            Performance Log: ${JSON.stringify(performanceLog)}
            You MUST respond in a valid JSON format with this structure:
            {
              "score": "X/Y",
              "knowledgeMap": {
                "strongAreas": "A summary of topics the user answered correctly.",
                "areasForImprovement": "A summary of topics the user struggled with."
              },
              "digDeeper": [
                { "title": "Resource title for an area of improvement", "url": "A real, relevant URL" },
                { "title": "Another resource title", "url": "Another real URL" }
              ]
            }`
        };

        const finalResponse = await callPerplexityAPI([systemPrompt, ...conversationHistory]);

        if (finalResponse) {
            let summaryHTML = `
                <div class="summary-card">
                    <h3>Quiz Complete!</h3>
                    <p><b>Your Score:</b> ${finalResponse.score}</p>
                </div>
                <div class="summary-card">
                    <h3>Your Knowledge Map</h3>
                    <p><b>Strong Areas:</b> ${finalResponse.knowledgeMap.strongAreas}</p>
                    <p><b>Areas for Improvement:</b> ${finalResponse.knowledgeMap.areasForImprovement}</p>
                </div>
                <div class="summary-card">
                    <h3>Dig Deeper on Your Weak Spots</h3>
                    <ul>
                        ${finalResponse.digDeeper.map(item => `<li><a href="${item.url}" target="_blank">${item.title}</a></li>`).join('')}
                    </ul>
                </div>
            `;
            addMessage(summaryHTML, 'bot');
            optionsContainer.classList.remove('hidden');
            exploreBtn.classList.add('hidden'); // Hide explore button at the end
        }
    };
    
    // --- Event Handlers ---
    const handleUserInput = async () => {
        const userText = userInput.value.trim();
        if (!userText) return;

        addMessage(userText, 'user');
        userInput.value = '';
        toggleInput(false);

        if (gameState === 'START') {
            await startQuiz(userText);
        } else if (gameState === 'AWAITING_ANSWER') {
            conversationHistory.push({ role: 'user', content: userText });
            await evaluateAnswer(userText);
            if (questionCount >= MAX_QUESTIONS) {
                await generateFinalSummary();
            } else {
                addMessage(`Here's question ${questionCount + 1}/${MAX_QUESTIONS}:`, 'bot');
                await generateNextQuestion();
            }
        }
    };

    exploreBtn.addEventListener('click', async () => {
        addMessage(`*Let's take a quick detour to explore that last concept...*`, 'bot', 'correct');
        const systemPrompt = {
            role: 'system',
            content: `You are an encyclopedia. Concisely explain the concept behind this question: "${lastQuestion}". Use your search capabilities to provide an accurate, easy-to-understand explanation.`
        };
        const apiResponse = await callPerplexityAPI([systemPrompt], 'sonar-pro');
        if (apiResponse) {
            addMessage(apiResponse.explanation, 'bot'); // Assuming the key is 'explanation'
        }
    });

    // --- Initialization ---
    addMessage("Hello! I'm your adaptive learning guide. What topic would you like to be quizzed on today?", 'bot');
    sendBtn.addEventListener('click', handleUserInput);
    userInput.addEventListener('keypress', (e) => e.key === 'Enter' && handleUserInput());

    // Re-enable functions for UI helpers that were commented out
    showLoading = () => {
        const loadingElement = document.createElement('div');
        loadingElement.classList.add('loading-indicator');
        loadingElement.innerHTML = '<span></span><span></span><span></span>';
        chatBox.appendChild(loadingElement);
        chatBox.scrollTop = chatBox.scrollHeight;
    };

    hideLoading = () => {
        const loadingElement = chatBox.querySelector('.loading-indicator');
        if (loadingElement) {
            chatBox.removeChild(loadingElement);
        }
    };
});
