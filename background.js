// Background service worker for the extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('AI Sheets Helper installed');
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getApiResponse') {
    handleApiRequest(request.data)
      .then(response => sendResponse({ success: true, data: response }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep the message channel open for async response
  }
});

async function handleApiRequest(data) {
  const VERCEL_API_URL = 'https://your-vercel-app.vercel.app/api';
  
  try {
    const response = await fetch(`${VERCEL_API_URL}/${data.endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data.payload)
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('API request error:', error);
    throw error;
  }
}
