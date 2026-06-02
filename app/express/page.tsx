"use client";

import React, { useState } from "react";
import { PassengerProfileManager } from "@/components/PassengerProfileManager";

const BOOKMARKLET_CODE = `javascript:(function(){const h=window.location.hash||window.location.search,m=h.match(/expressData=([^&#]+)/);if(!m){alert("No LastBerth Express passenger data found in the URL. Please click a booking link from your alert or use the Test Form below.");return;}let ps=[];try{ps=JSON.parse(atob(decodeURIComponent(m[1])));}catch(e){alert("Failed to decode passenger data: "+e.message);return;}if(!Array.isArray(ps)||ps.length===0){alert("No passengers found.");return;}let f=0;const ns=Array.from(document.querySelectorAll('input[placeholder*="Name"i],input[formcontrolname*="Name"i],.ui-autocomplete-input,input[name*="name"i]')),as=Array.from(document.querySelectorAll('input[placeholder*="Age"i],input[formcontrolname*="Age"i],input[name*="age"i]')),gs=Array.from(document.querySelectorAll('select[formcontrolname*="Gender"i],select[formcontrolname*="gender"i],select[name*="gender"i]')),bs=Array.from(document.querySelectorAll('select[formcontrolname*="Berth"i],select[formcontrolname*="berth"i],select[name*="berth"i]'));for(let i=0;i<ps.length;i++){const p=ps[i],ni=ns[i],ai=as[i];if(ni){ni.value=p.name;ni.dispatchEvent(new Event('input',{bubbles:!0}));ni.dispatchEvent(new Event('change',{bubbles:!0}));}if(ai){ai.value=p.age;ai.dispatchEvent(new Event('input',{bubbles:!0}));ai.dispatchEvent(new Event('change',{bubbles:!0}));}const gsEl=gs[i]||(ni&&ni.closest('tr,div.row,div.form-group,div')?.querySelector('select'));if(gsEl){const val=p.gender==='M'?'M':(p.gender==='F'?'F':'T');for(let o of gsEl.options){if(o.value===val||o.value.toUpperCase()===p.gender||o.text.toUpperCase().startsWith(p.gender)){gsEl.value=o.value;break;}}gsEl.dispatchEvent(new Event('change',{bubbles:!0}));}const bsEl=bs[i]||(ni&&ni.closest('tr,div.row,div.form-group,div')?.querySelectorAll('select')[1]);if(bsEl&&p.berth){for(let o of bsEl.options){if(o.value.toUpperCase()===p.berth.toUpperCase()||o.text.toUpperCase().includes(p.berth.toUpperCase())){bsEl.value=o.value;break;}}bsEl.dispatchEvent(new Event('change',{bubbles:!0}));}f++;}alert("LastBerth Express: Filled "+f+" passenger(s) successfully!");})();`;

export default function ExpressPage() {
  const [copied, setCopied] = useState(false);
  const [mockName, setMockName] = useState("");
  const [mockAge, setMockAge] = useState("");
  const [mockGender, setMockGender] = useState("");
  const [mockBerth, setMockBerth] = useState("");

  const handleCopy = () => {
    navigator.clipboard.writeText(BOOKMARKLET_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTestLoad = () => {
    // Inject mock data into hash to let bookmarklet run on this same page for demonstration!
    const mockData = [
      { name: "Rahul Sharma", age: 34, gender: "M", berth: "LB" }
    ];
    const base64Str = btoa(JSON.stringify(mockData));
    window.location.hash = `expressData=${base64Str}`;
    alert("Mock passenger data loaded into page URL hash! Now click/run the bookmarklet from your bookmarks bar to see it auto-fill the test form below!");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white pb-20">
      {/* Background radial glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[500px] bg-gradient-radial from-indigo-500/10 via-transparent to-transparent pointer-events-none" />

      {/* Header / Nav */}
      <header className="border-b border-slate-800/80 bg-slate-950/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 text-lg font-black tracking-tight text-white">
            <span className="text-xl">⚡</span>
            <span>LASTBERTH <span className="bg-indigo-600 text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded ml-1">EXPRESS</span></span>
          </a>
          <a
            href="/"
            className="text-xs font-bold text-slate-400 hover:text-white transition-colors"
          >
            ← Back to Home
          </a>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl mx-auto px-4 mt-12 relative z-10">
        {/* Hero Section */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/5 text-indigo-400 text-xs font-semibold mb-4 animate-pulse">
            <span>⚡</span> One-Click Auto-Fill Engine
          </div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent leading-none">
            Book Confirm Seats in <span className="text-indigo-400">1-Second</span>
          </h1>
          <p className="mt-4 text-sm md:text-base text-slate-400 leading-relaxed">
            Stop losing precious seats to fast-finger booking races. Add the LastBerth Express bookmarklet to your browser, click alert URLs, and auto-fill your passenger profiles instantly.
          </p>
        </div>

        {/* The Bookmarklet Drag Area */}
        <div className="relative group overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/40 p-8 md:p-12 shadow-2xl backdrop-blur-sm mb-12">
          {/* Glowing border effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

          <div className="flex flex-col items-center text-center max-w-lg mx-auto relative z-10">
            <span className="text-4xl mb-4">🚀</span>
            <h3 className="text-lg md:text-xl font-extrabold text-white">Drag to Bookmarks Bar</h3>
            <p className="text-xs md:text-sm text-slate-400 mt-2 mb-8">
              Drag the glowing button below straight into your browser&apos;s Bookmarks/Favorites bar.
            </p>

            {/* Drag Button */}
            <a
              href={BOOKMARKLET_CODE}
              onClick={(e) => e.preventDefault()}
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 px-8 py-5 text-sm md:text-base font-black text-white shadow-xl shadow-indigo-500/20 hover:shadow-indigo-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-grab border border-indigo-400/20"
              title="Drag me to your Bookmarks Bar!"
            >
              <span>⚡</span> LastBerth Express
            </a>

            {/* Alternative Copy Link */}
            <div className="mt-8 pt-6 border-t border-slate-800/80 w-full flex flex-col sm:flex-row items-center justify-between gap-4">
              <span className="text-[11px] text-slate-500 font-medium">Bookmarks bar hidden? Press Ctrl+Shift+B (Cmd+Shift+B on Mac) to show it.</span>
              <button
                type="button"
                onClick={handleCopy}
                className="shrink-0 text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-all flex items-center gap-1 bg-indigo-500/10 px-3 py-1.5 rounded-lg border border-indigo-500/20"
              >
                {copied ? "✓ Copied!" : "📋 Copy Script Instead"}
              </button>
            </div>
          </div>
        </div>

        {/* Step-by-Step Walkthrough */}
        <h3 className="text-xl font-extrabold text-white mb-6">How It Works</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/20 p-6">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400 text-sm font-black mb-4">1</span>
            <h4 className="text-sm font-bold text-white">Save the Widget</h4>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Drag the button above to your Bookmarks bar or copy the script to create a manual bookmark.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/20 p-6">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400 text-sm font-black mb-4">2</span>
            <h4 className="text-sm font-bold text-white">Click WhatsApp Alert</h4>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              When you get a ticket vacancy alert, click the booking link which includes your passenger data hash.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/20 p-6">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400 text-sm font-black mb-4">3</span>
            <h4 className="text-sm font-bold text-white">One-Click Auto-Fill</h4>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              On the IRCTC passenger details page, click the bookmarklet. Watch the form fill and save instantly.
            </p>
          </div>
        </div>

        {/* Interactive Live Playground */}
        <div className="border border-slate-800 bg-slate-900/20 rounded-3xl p-6 md:p-8 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-slate-800/80 pb-4">
            <div>
              <h4 className="text-base font-extrabold text-white flex items-center gap-1.5">
                <span>🎯</span> Interactive Demo Playground
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">Test the bookmarklet instantly right on this page before using it on IRCTC!</p>
            </div>
            <button
              type="button"
              onClick={handleTestLoad}
              className="rounded-lg bg-slate-800 hover:bg-slate-700 px-3.5 py-2 text-xs font-bold text-white transition-all flex items-center gap-1"
            >
              🚀 Load Mock Passenger Data
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Demo Instructions */}
            <div className="space-y-4">
              <p className="text-xs text-slate-300 leading-relaxed">
                To try the demo, follow these simple steps:
              </p>
              <ol className="list-decimal list-inside text-xs text-slate-400 space-y-2 leading-relaxed">
                <li>Make sure you have dragged the <strong className="text-indigo-400">LastBerth Express</strong> button into your bookmarks bar.</li>
                <li>Click the <strong className="text-indigo-400">Load Mock Passenger Data</strong> button to put mock data into the URL hash.</li>
                <li>Click the <strong className="text-indigo-400">LastBerth Express</strong> bookmarklet from your bookmarks bar.</li>
                <li>Watch the Mock IRCTC Passenger Form fill instantly!</li>
              </ol>
            </div>

            {/* Mock IRCTC Passenger Form */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block border-b border-slate-850 pb-1.5">
                🎫 Mock IRCTC Passenger Form
              </span>
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Passenger Name
                  </label>
                  <input
                    type="text"
                    name="name"
                    placeholder="Passenger Name"
                    value={mockName}
                    onChange={(e) => setMockName(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300 focus:border-indigo-500 focus:outline-none"
                    readOnly
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Age
                    </label>
                    <input
                      type="text"
                      name="age"
                      placeholder="Age"
                      value={mockAge}
                      onChange={(e) => setMockAge(e.target.value)}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300 focus:border-indigo-500 focus:outline-none"
                      readOnly
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Gender
                    </label>
                    <select
                      name="gender"
                      value={mockGender}
                      onChange={(e) => setMockGender(e.target.value)}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300 focus:border-indigo-500 focus:outline-none"
                      disabled
                    >
                      <option value="">Select Gender</option>
                      <option value="M">Male</option>
                      <option value="F">Female</option>
                      <option value="O">Other</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Berth Preference
                  </label>
                  <select
                    name="berth"
                    value={mockBerth}
                    onChange={(e) => setMockBerth(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300 focus:border-indigo-500 focus:outline-none"
                    disabled
                  >
                    <option value="">No Preference</option>
                    <option value="LB">Lower Berth (LB)</option>
                    <option value="MB">Middle Berth (MB)</option>
                    <option value="UB">Upper Berth (UB)</option>
                    <option value="SL">Side Lower (SL)</option>
                    <option value="SU">Side Upper (SU)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
