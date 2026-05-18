import React from 'react';
import { Send, Bot, User, Sparkles, Trash2, Copy, Check, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from '@google/genai';
import { cn } from '../lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const QUICK_PROMPTS = [
  { icon: '⚖️', label: 'Bail Grounds', prompt: 'IPC 302 murder case mein bail application ke grounds kya hote hain? Landmark cases ke saath Hindi mein batayein.' },
  { icon: '📋', label: '498A vs 304B', prompt: 'IPC Section 498A aur 304B mein kya antar hai? Punishment, bail aur evidence ke saath explain karein.' },
  { icon: '🏛️', label: 'Anticipatory Bail', prompt: 'BNSS Section 438 anticipatory bail ke liye kya conditions hain? Draft grounds bhi batayein.' },
  { icon: '📝', label: 'Cheque Bounce', prompt: 'NI Act Section 138 cheque bounce case mein legal notice ka draft banayein aur kya prove karna hoga?' },
  { icon: '⏱️', label: 'Limitation', prompt: 'Civil suit aur criminal appeal ki limitation period kya hai? Condonation of delay ke grounds bhi batayein.' },
  { icon: '🔍', label: 'Circumstantial Evidence', prompt: 'Criminal case mein circumstantial evidence accept karne ke liye Supreme Court ke kya rules hain? Panchsheel conditions explain karein.' },
  { icon: '👨‍⚖️', label: 'Section 125', prompt: 'BNSS Section 144 (pehle CrPC 125) maintenance case mein kya prove karna hota hai? Amount kaise decide hoti hai?' },
  { icon: '🛡️', label: 'FIR Quash', prompt: 'High Court mein FIR quash karne ke grounds kya hain? BNSS 528 ke under important SC cases ke saath batayein.' },
  { icon: '📜', label: 'Vakalatnama Draft', prompt: 'Criminal case ke liye standard vakalatnama ka draft banayein.' },
  { icon: '⚡', label: 'Section 482 BNSS', prompt: 'BNSS Section 482 inherent powers ka kab use hota hai? Abuse of process ke kya grounds hain?' },
];

const getApiKey = (): string => {
  // Multiple fallbacks for the API key
  const key =
    (typeof process !== 'undefined' && (process.env as any)?.GEMINI_API_KEY) ||
    (typeof process !== 'undefined' && (process.env as any)?.API_KEY) ||
    (window as any).__GEMINI_API_KEY__ ||
    '';
  return key;
};

const formatText = (text: string) => {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^#{1,3} (.+)$/gm, '<h4 style="font-weight:700;margin:8px 0 4px">$1</h4>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
};

export const AIAssistant = () => {
  const [messages, setMessages] = React.useState<Message[]>([
    {
      id: '0', role: 'assistant',
      content: '🙏 **Namaskar Advocate Sahab!**\n\nMain aapka AI Legal Assistant hoon — Gemini AI se powered.\n\nMain in vishayon mein aapki madad kar sakta hoon:\n• **IPC / BNS** sections explain karna\n• **BNSS / CrPC** procedures\n• **Bail application** ke grounds\n• **Legal notice** drafting\n• **Case strategy** suggestions\n• **Landmark judgments**\n• **Vakalatnama** drafts\n\nNeeche se quick prompt chunein ya kuch bhi poochein — Hindi ya English mein!'
    }
  ]);
  const [input, setInput] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [copied, setCopied] = React.useState<string | null>(null);
  const [apiKeyMissing, setApiKeyMissing] = React.useState(false);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  React.useEffect(() => {
    const key = getApiKey();
    if (!key) setApiKeyMissing(true);
  }, []);

  const sendMessage = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput('');

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: msg };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setLoading(true);

    try {
      const apiKey = getApiKey();
      if (!apiKey) throw new Error('API_KEY_MISSING');

      const ai = new GoogleGenAI({ apiKey });

      const systemInstruction = `You are an expert Indian legal assistant for practicing advocates in India.

Your knowledge covers:
- Bharatiya Nyaya Sanhita (BNS) 2023 replacing IPC
- Bharatiya Nagarik Suraksha Sanhita (BNSS) 2023 replacing CrPC
- Bharatiya Sakshya Adhiniyam (BSA) 2023 replacing Evidence Act
- Code of Civil Procedure (CPC) 1908
- Constitution of India with all amendments
- Supreme Court and High Court landmark judgments
- POCSO Act, Protection of Women from Domestic Violence Act
- Hindu Marriage Act, Muslim Personal Law (Dissolution of Marriage)
- Motor Vehicles Act, Negotiable Instruments Act
- Consumer Protection Act, RERA
- Limitation Act 1963

Rules:
1. Respond in the SAME language as the user (Hindi/English/Hinglish)
2. Always cite specific section numbers and landmark cases with citations
3. For criminal sections: mention punishment, bailable/non-bailable, cognizable/non-cognizable, compoundable status
4. For legal notices/drafts: provide actual complete draft text
5. Be practical and court-ready in your advice
6. Mention both old law (IPC/CrPC) and new law (BNS/BNSS) where applicable
7. Structure responses clearly with headings and bullet points`;

      const history = newMessages.slice(1, -1).slice(-8).map(m => ({
        role: m.role === 'assistant' ? 'model' as const : 'user' as const,
        parts: [{ text: m.content }]
      }));

      const chat = ai.chats.create({
        model: 'gemini-2.0-flash',
        config: { systemInstruction, maxOutputTokens: 2000, temperature: 0.7 },
        history,
      });

      const response = await chat.sendMessage({ message: msg });
      const responseText = response.text || 'Response generate nahi ho paya. Please retry.';

      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: responseText }]);
    } catch (error: any) {
      let errorMsg = '⚠️ **Error:** Kuch galat hua. Please retry karein.';

      if (error.message === 'API_KEY_MISSING') {
        errorMsg = '🔑 **API Key Missing!**\n\nGemini API key set nahi hai.\n\n**Fix karein:**\nGitHub repo → Settings → Secrets → `GEMINI_API_KEY` add karein.\n\nFir Actions se naya APK build karein.';
        setApiKeyMissing(true);
      } else if (error.message?.includes('API_KEY_INVALID') || error.message?.includes('400')) {
        errorMsg = '🔑 **Invalid API Key!**\n\nAPI key galat hai. Google AI Studio se nai key lein aur GitHub Secrets update karein.';
      } else if (error.message?.includes('QUOTA') || error.message?.includes('429')) {
        errorMsg = '⏳ **Rate Limit!**\n\nThodi der baad retry karein. Free tier ka limit exhaust ho gaya hai.';
      } else if (error.message?.includes('NetworkError') || error.message?.includes('fetch')) {
        errorMsg = '📡 **Network Error!**\n\nInternet connection check karein. Gemini API tak pahunch nahi paa raha.';
      }

      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: errorMsg }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const copyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="flex flex-col h-full bg-zinc-50">
      {/* Header */}
      <div className="relative overflow-hidden p-5 shrink-0"
        style={{ background: 'linear-gradient(135deg, #0a0f1e 0%, #1a0a35 100%)' }}>
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <Sparkles size={70} className="text-purple-400" />
        </div>
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}>
            <Bot size={24} className="text-white" />
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-[0.3em] font-bold text-purple-400">Powered by Gemini AI</p>
            <h2 className="text-xl font-display font-bold text-white">Legal AI Assistant</h2>
          </div>
        </div>

        {apiKeyMissing && (
          <div className="relative z-10 mt-3 flex items-start gap-2 p-3 rounded-xl"
            style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)' }}>
            <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-red-300">GEMINI_API_KEY not set!</p>
              <p className="text-[10px] text-red-400 mt-0.5">GitHub Secrets mein GEMINI_API_KEY add karein, phir naya APK build karein.</p>
            </div>
          </div>
        )}
      </div>

      {/* Quick Prompts */}
      <div className="px-3 py-2.5 bg-white border-b shrink-0 overflow-x-auto">
        <div className="flex gap-2" style={{ width: 'max-content' }}>
          {QUICK_PROMPTS.map(p => (
            <button key={p.label} onClick={() => sendMessage(p.prompt)}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-xl text-[11px] font-bold text-zinc-600 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700 transition-all whitespace-nowrap disabled:opacity-50">
              <span>{p.icon}</span> {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m) => (
          <motion.div key={m.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn('flex gap-2.5', m.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>

            <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-sm',
              m.role === 'user' ? 'bg-legal-green' : 'bg-gradient-to-br from-purple-600 to-indigo-600')}>
              {m.role === 'user' ? <User size={15} className="text-white" /> : <Bot size={15} className="text-white" />}
            </div>

            <div className={cn('max-w-[82%]', m.role === 'user' ? 'items-end' : 'items-start flex flex-col')}>
              <div className={cn('px-4 py-3 text-sm leading-relaxed shadow-sm',
                m.role === 'user'
                  ? 'bg-legal-green text-white rounded-2xl rounded-tr-sm'
                  : 'bg-white text-zinc-800 rounded-2xl rounded-tl-sm border border-zinc-100')}
                dangerouslySetInnerHTML={{ __html: formatText(m.content) }} />

              {m.role === 'assistant' && (
                <button onClick={() => copyText(m.id, m.content)}
                  className="mt-1 flex items-center gap-1 text-[10px] text-zinc-300 hover:text-zinc-500 px-2 py-0.5 transition-all">
                  {copied === m.id ? <><Check size={10} className="text-legal-green" /> Copied</> : <><Copy size={10} /> Copy</>}
                </button>
              )}
            </div>
          </motion.div>
        ))}

        {loading && (
          <div className="flex gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center shadow-sm">
              <Bot size={15} className="text-white" />
            </div>
            <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 border border-zinc-100 shadow-sm flex items-center gap-1.5">
              {[0,1,2].map(i => (
                <motion.div key={i} className="w-2 h-2 bg-purple-400 rounded-full"
                  animate={{ y: [0, -5, 0] }}
                  transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.12 }} />
              ))}
              <span className="text-xs text-zinc-400 ml-1">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 bg-white border-t shrink-0">
        <div className="flex items-end gap-2">
          <button onClick={() => setMessages([messages[0]])}
            className="p-2.5 text-zinc-300 hover:text-red-400 hover:bg-red-50 rounded-xl transition-all shrink-0">
            <Trash2 size={17} />
          </button>
          <div className="flex-1 flex items-end bg-zinc-50 border border-zinc-200 rounded-2xl px-3.5 py-2.5 focus-within:border-purple-400 transition-colors">
            <textarea ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="IPC section, bail grounds, legal notice... (Enter = send)"
              rows={1}
              style={{ resize: 'none', maxHeight: '120px', lineHeight: '1.5' }}
              className="flex-1 bg-transparent text-sm outline-none" />
          </div>
          <button onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            className="p-3 rounded-xl shadow-lg transition-all active:scale-95 shrink-0 disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}>
            <Send size={17} className="text-white" />
          </button>
        </div>
      </div>
    </div>
  );
};
