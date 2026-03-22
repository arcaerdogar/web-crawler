import { useState } from "react";
import { CrawlerForm } from "./components/CrawlerForm.tsx";
import { SearchPanel } from "./components/SearchPanel.tsx";
import { JobList } from "./components/JobList.tsx";
import "./App.css";

type Tab = "crawler" | "search" | "jobs";

function App() {
  const [tab, setTab] = useState<Tab>("crawler");
  const [focusJobId, setFocusJobId] = useState<string | null>(null);

  const handleJobStarted = (jobId: string) => {
    setFocusJobId(jobId);
    setTab("jobs");
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">Web Crawler & Search Engine</h1>
        <nav className="tab-nav">
          <button
            className={`tab-btn ${tab === "crawler" ? "active" : ""}`}
            onClick={() => setTab("crawler")}
          >
            Crawler
          </button>
          <button
            className={`tab-btn ${tab === "search" ? "active" : ""}`}
            onClick={() => setTab("search")}
          >
            Search
          </button>
          <button
            className={`tab-btn ${tab === "jobs" ? "active" : ""}`}
            onClick={() => setTab("jobs")}
          >
            Jobs
          </button>
        </nav>
      </header>

      <main className="app-main">
        {tab === "crawler" && <CrawlerForm onJobStarted={handleJobStarted} />}
        {tab === "search" && <SearchPanel />}
        {tab === "jobs" && (
          <JobList
            focusJobId={focusJobId}
            onFocusConsumed={() => setFocusJobId(null)}
          />
        )}
      </main>
    </div>
  );
}

export default App;
