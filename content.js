(function() {
    // Prevent multiple injections
    if (window.tvBacktestAnalyzerInjected) return;
    window.tvBacktestAnalyzerInjected = true;

    console.log("TV Backtest Analyzer: Content script injected successfully.");

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "START_SCRAPE") {
            console.log("TV Backtest Analyzer: Received START_SCRAPE message.");
            scrapeTrades()
                .then(data => {
                    console.log("Scrape successful, sending data back.", data.length, "trades");
                    sendResponse({ trades: data, success: true });
                })
                .catch(err => {
                    console.error("Scrape failed", err);
                    sendResponse({ trades: [], success: false, error: err.toString() });
                });
            return true; // Keep channel open
        }
    });

    async function scrapeTrades() {
        const trades = new Map();
        
        // 1. Find the header row by searching for "Trade #" text using TreeWalker (much faster and safer than querySelectorAll)
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        let node;
        let headerElement = null;
        while ((node = walker.nextNode())) {
            if (node.nodeValue && node.nodeValue.trim().includes('Trade #')) {
                headerElement = node.parentElement;
                break;
            }
        }

        if (!headerElement) {
            throw new Error("Could not detect the 'Trade #' header. Please ensure the 'List of trades' tab is visible.");
        }

        // 2. Find the container that holds the list (usually a few levels up)
        let container = headerElement.parentElement;
        while (container && container.offsetHeight < 200) {
            container = container.parentElement;
        }

        if (!container) {
            throw new Error("Could not identify the trade list container.");
        }

        // 3. Find the scrollable area
        let scrollable = container;
        while (scrollable && scrollable.scrollHeight <= scrollable.clientHeight) {
            scrollable = scrollable.parentElement;
            if (scrollable === document.body) break;
        }

        let lastCount = -1;
        let attempts = 0;

        while (attempts < 30) {
            // Find all rows in the container
            const potentialRows = container.querySelectorAll('div[data-name="tr"], tr');
            
            potentialRows.forEach(row => {
                const text = row.innerText || "";
                // Look for rows that have "Exit" and a P&L pattern
                if (text.includes("Exit") && (text.includes("+") || text.includes("-") || text.includes("−"))) {
                    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                    
                    // The first line is usually the trade ID (e.g., "284 Short")
                    const tradeId = lines[0].split(/\s+/)[0];
                    
                    if (tradeId && !isNaN(parseInt(tradeId)) && !trades.has(tradeId)) {
                        // Find the P&L value in this row's text
                        const pnlMatch = text.match(/([+−-]\d[0-9,.]*)/);
                        if (pnlMatch) {
                            const val = parseFloat(pnlMatch[1].replace('−', '-').replace(/,/g, ''));
                            if (!isNaN(val)) {
                                trades.set(tradeId, { 
                                    id: tradeId, 
                                    pnl: val,
                                    rawData: lines
                                });
                            }
                        }
                    }
                }
            });

            if (trades.size === lastCount) {
                attempts++;
            } else {
                lastCount = trades.size;
                attempts = 0;
            }

            if (scrollable) scrollable.scrollTop += 300;
            await new Promise(r => setTimeout(r, 200));
        }

        return Array.from(trades.values()).sort((a, b) => parseInt(a.id) - parseInt(b.id));
    }
})();
