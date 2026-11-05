import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ChatWindow from './components/chat/ChatWindow';
import './index.css';

const isChatWindow = new URLSearchParams(window.location.search).get('chatWindow') === '1';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isChatWindow ? <ChatWindow /> : <App />}
  </StrictMode>,
);
