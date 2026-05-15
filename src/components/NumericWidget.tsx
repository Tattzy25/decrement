import React, { useState, useEffect } from 'react';
import { Plus, Minus, History, Activity, Database, User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Transaction, TransactionType, CounterState } from '../types';

export default function NumericWidget() {
  const [state, setState] = useState<CounterState | null>(null);
  const [amount, setAmount] = useState<number>(1);
  const [customerId, setCustomerId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  // Fetch initial state
  const fetchState = async () => {
    try {
      const res = await fetch('/api/state');
      const data = await res.json();
      setState(data);
    } catch (err) {
      console.error('Failed to fetch state:', err);
    }
  };

  useEffect(() => {
    fetchState();
  }, []);

  const handleTransaction = async (type: TransactionType) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          amount,
          metadata: { customerId: customerId || 'anonymous' }
        }),
      });
      const data = await res.json();
      setState(data.state);
    } catch (err) {
      console.error('Transaction failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const projectedValue = state 
    ? (state.currentValue + (amount || 0)) 
    : 0;
  
  const projectedValueMinus = state 
    ? (state.currentValue - (amount || 0)) 
    : 0;

  if (!state) return (
    <div className="flex items-center justify-center p-12 text-zinc-500 font-mono text-sm">
      INITIALIZING_WIDGET...
    </div>
  );

  return (
    <div className="w-full max-w-6xl h-[85vh] bg-[#121212] border border-[#222222] rounded-3xl shadow-[0_30px_60px_-12px_rgba(0,0,0,0.8)] flex overflow-hidden font-sans text-gray-300">
      
      {/* Sidebar: Transaction Audit */}
      <div className="w-80 border-r border-[#222222] bg-[#0F0F0F] flex flex-col hidden lg:flex">
        <div className="p-6 border-b border-[#222222]">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-[10px] font-bold tracking-[0.2em] text-emerald-500 uppercase">Live Feed</span>
          </div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Transaction Audit</h3>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-hide">
          <AnimatePresence initial={false}>
            {state.history.map((tx) => (
              <motion.div 
                key={tx.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-3 bg-[#181818] border border-[#282828] rounded-lg"
              >
                <div className="flex justify-between text-[11px] mb-1 font-mono">
                  <span className="text-gray-500">{new Date(tx.timestamp).toLocaleTimeString([], { hour12: false })}</span>
                  <span className={tx.type === TransactionType.INCREMENT ? 'text-emerald-400' : 'text-rose-400'}>
                    {tx.type === TransactionType.INCREMENT ? '+' : '-'}{tx.amount.toFixed(2)}
                  </span>
                </div>
                <div className="text-[13px] text-white font-medium truncate">{tx.metadata?.customerId}</div>
              </motion.div>
            ))}
            {state.history.length === 0 && (
              <div className="text-center py-12 text-gray-600 text-xs font-mono uppercase tracking-widest opacity-50">
                Awaiting Data...
              </div>
            )}
          </AnimatePresence>
        </div>

        <div className="p-6 border-t border-[#222222] bg-[#0A0A0A]">
          <div className="text-[10px] font-mono text-gray-600">REST API v2.4.1</div>
          <div className="text-[10px] font-mono text-gray-600 uppercase tracking-tighter">MCP_NODE_ACTIVE_01</div>
        </div>
      </div>

      {/* Main Content: Accumulator */}
      <div className="flex-1 flex flex-col p-6 md:p-12 overflow-y-auto scrollbar-hide">
        <div className="flex justify-between items-start mb-8 md:mb-16">
          <div className="space-y-1">
            <span className="text-[11px] uppercase tracking-[0.3em] text-gray-500 font-bold">Integration Widget</span>
            <h1 className="text-2xl md:text-3xl font-light text-white tracking-tight italic">Real-time Accumulator</h1>
          </div>
          <div className="px-4 py-2 bg-[#1A1A1A] border border-[#333333] rounded-full hidden sm:block">
            <span className="text-[11px] font-mono text-blue-400">SESSION: 0xFD42A</span>
          </div>
        </div>

        <div className="flex-1 flex flex-col justify-center items-center gap-8 md:gap-12">
          {/* Values Row */}
          <div className="w-full flex flex-col md:flex-row justify-between items-center px-4 md:px-12 gap-8 md:gap-0">
            <div className="text-center">
              <div className="text-[11px] uppercase tracking-widest text-gray-500 mb-2 font-semibold">Previous State</div>
              <div className="text-3xl md:text-4xl font-light text-gray-600 font-mono">
                {state.lastTransaction?.previousValue?.toLocaleString(undefined, { minimumFractionDigits: 2 }) ?? '0.00'}
              </div>
            </div>
            
            <div className="h-px w-full md:w-auto md:flex-1 bg-gradient-to-r from-transparent via-[#333333] to-transparent mx-0 md:mx-8"></div>
            
            <div className="text-center relative">
               <div className="text-[10px] uppercase tracking-[0.2em] text-blue-400 mb-4 font-bold bg-blue-400/10 py-1 px-3 rounded inline-block">
                 Current Real-Time
               </div>
               <motion.div 
                 key={state.currentValue}
                 initial={{ opacity: 0, scale: 0.95 }}
                 animate={{ opacity: 1, scale: 1 }}
                 className="text-7xl md:text-[120px] font-thin text-white leading-none tracking-tighter font-mono"
               >
                 {state.currentValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
               </motion.div>
            </div>
            
            <div className="h-px w-full md:w-auto md:flex-1 bg-gradient-to-r from-transparent via-[#333333] to-transparent mx-0 md:mx-8"></div>
            
            <div className="text-center">
              <div className="text-[11px] uppercase tracking-widest text-gray-500 mb-2 font-semibold">Projected Next</div>
              <div className="text-3xl md:text-4xl font-light text-blue-500/50 font-mono italic">
                {projectedValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          {/* Controls Card */}
          <div className="w-full max-w-2xl bg-[#181818] border border-[#282828] rounded-2xl p-6 md:p-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold ml-1">Customer ID</label>
                <div className="relative">
                  <input 
                    type="text" 
                    value={customerId} 
                    onChange={(e) => setCustomerId(e.target.value)}
                    placeholder="UID-8830"
                    className="w-full bg-[#0A0A0A] border border-[#333333] rounded-lg px-4 py-3 text-sm text-gray-300 outline-none focus:border-blue-500/50 transition-colors"
                  />
                  <User className="absolute right-3 top-3 w-4 h-4 text-gray-600" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold ml-1">Increment Value</label>
                <div className="relative">
                  <input 
                    type="number" 
                    value={amount} 
                    onChange={(e) => setAmount(Number(e.target.value))}
                    className="w-full bg-[#0A0A0A] border border-[#3B82F6]/30 rounded-lg px-4 py-3 text-sm text-white font-mono font-bold outline-none focus:border-blue-500/80 transition-colors"
                  />
                  <Activity className="absolute right-3 top-3 w-4 h-4 text-blue-500/50" />
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 mt-8">
              <button 
                onClick={() => handleTransaction(TransactionType.DECREMENT)}
                disabled={isLoading}
                className="flex-1 h-20 bg-rose-950/20 border border-rose-900/40 hover:bg-rose-950/40 active:bg-rose-950/60 rounded-xl flex items-center justify-center gap-3 transition-all group disabled:opacity-50"
              >
                <div className="w-8 h-8 rounded-full border border-rose-400/30 flex items-center justify-center text-rose-400 text-2xl font-light group-hover:border-rose-400/60 group-active:scale-95 transition-all">−</div>
                <span className="text-sm font-semibold text-rose-200 uppercase tracking-widest">Deduct</span>
              </button>
              
              <button 
                onClick={() => handleTransaction(TransactionType.INCREMENT)}
                disabled={isLoading}
                className="flex-1 h-20 bg-emerald-950/20 border border-emerald-900/40 hover:bg-emerald-950/40 active:bg-emerald-950/60 rounded-xl flex items-center justify-center gap-3 transition-all group disabled:opacity-50"
              >
                <div className="w-8 h-8 rounded-full border border-emerald-400/30 flex items-center justify-center text-emerald-400 text-2xl font-light group-hover:border-emerald-400/60 group-active:scale-95 transition-all">+</div>
                <span className="text-sm font-semibold text-emerald-200 uppercase tracking-widest">Accumulate</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer Meta */}
        <div className="mt-auto flex justify-between items-center pt-8 border-t border-[#222222] opacity-50">
          <div className="text-[10px] text-gray-600 font-mono">SYSTEM_ID: WIDGET-ALPHA-X</div>
          <div className="flex gap-6 hidden sm:flex">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-gray-600"></div>
              <span className="text-[10px] uppercase font-bold tracking-widest">Rest Hooks</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.5)]"></div>
              <span className="text-[10px] uppercase font-bold tracking-widest">Socket.io</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
