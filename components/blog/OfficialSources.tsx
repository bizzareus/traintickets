import React from "react";

export function OfficialSources({ sources }: { sources: string[] }) {
  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-8 rounded-xl bg-blue-50/50 p-6 border border-blue-100">
      <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        Official Sources & Citations
      </h3>
      <p className="text-xs text-slate-600 mb-4">
        The information in this guide has been verified against official circulars and documentation from Indian Railways and IRCTC.
      </p>
      <ul className="flex flex-col gap-2">
        {sources.map((source, idx) => {
          let domain = source;
          try {
            domain = new URL(source).hostname.replace('www.', '');
          } catch {
            // fallback if it's not a valid URL
          }
          return (
            <li key={idx} className="text-sm">
              <a 
                href={source} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1"
              >
                {domain}
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
