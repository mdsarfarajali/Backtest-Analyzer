document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('start-btn');
    const resultsSection = document.getElementById('results-section');
    const loadingSection = document.getElementById('loading-section');
    const actionSection = document.querySelector('.action-section');

    const totalTradesEl = document.getElementById('total-trades');
    const posTradesEl = document.getElementById('pos-trades');
    const negTradesEl = document.getElementById('neg-trades');
    const posRatioEl = document.getElementById('pos-ratio');
    const negRatioEl = document.getElementById('neg-ratio');
    const totalProfitEl = document.getElementById('total-profit');
    const totalLossEl = document.getElementById('total-loss');
    const netProfitEl = document.getElementById('net-profit');

    let pnlChart = null;
    let currentTrades = []; // Store trades for download

    document.getElementById('close-btn').addEventListener('click', () => {
        window.close();
    });

    startBtn.addEventListener('click', async () => {
        actionSection.classList.add('hidden');
        loadingSection.classList.remove('hidden');

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // Manual injection as a fallback
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            }).catch(e => console.log("Injection skipped:", e));

            // Small delay then send message
            setTimeout(() => {
                chrome.tabs.sendMessage(tab.id, { action: "START_SCRAPE" }, (response) => {
                    if (chrome.runtime.lastError) {
                        alert("Connection Error. Please ensure you are on TradingView and the page has fully loaded. You may need to refresh the TradingView page one more time.");
                        resetUI();
                        return;
                    }

                    if (response && response.success) {
                        if (response.trades && response.trades.length > 0) {
                            currentTrades = response.trades;
                            displayResults(response.trades);
                        } else {
                            alert("No trades found. Please ensure the 'List of trades' tab is visible and active.");
                            resetUI();
                        }
                    } else if (response && !response.success) {
                        alert("Analysis Error: " + response.error);
                        resetUI();
                    } else {
                        alert("Unknown error occurred during analysis.");
                        resetUI();
                    }
                });
            }, 400);
        } catch (err) {
            console.error(err);
            alert("Unexpected error: " + err.message);
            resetUI();
        }
    });

    document.getElementById('download-btn').addEventListener('click', () => {
        if (!currentTrades || currentTrades.length === 0) {
            alert("No data to download.");
            return;
        }

        let csvContent = "data:text/csv;charset=utf-8,";
        
        // Determine the maximum number of raw data columns
        let maxCols = 0;
        currentTrades.forEach(t => {
            if (t.rawData && t.rawData.length > maxCols) {
                maxCols = t.rawData.length;
            }
        });

        // Create Header
        let headers = ["Trade ID", "Net P&L"];
        for(let i = 1; i <= maxCols; i++) {
            headers.push(`Detail ${i}`);
        }
        csvContent += headers.join(",") + "\n";
        
        // Create Rows
        currentTrades.forEach(t => {
            let row = [t.id, t.pnl];
            if (t.rawData) {
                t.rawData.forEach(d => {
                    // Escape quotes and wrap in quotes for CSV
                    row.push(`"${d.replace(/"/g, '""')}"`);
                });
            }
            csvContent += row.join(",") + "\n";
        });

        // Trigger Download
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "TradingView_Backtest_Report.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    function resetUI() {
        actionSection.classList.remove('hidden');
        loadingSection.classList.add('hidden');
        resultsSection.classList.add('hidden');
    }

    function displayResults(trades) {
        loadingSection.classList.add('hidden');
        resultsSection.classList.remove('hidden');

        const totalCount = trades.length;
        const posTrades = trades.filter(t => t.pnl > 0);
        const negTrades = trades.filter(t => t.pnl <= 0);

        const totalProfit = posTrades.reduce((sum, t) => sum + t.pnl, 0);
        const totalLoss = negTrades.reduce((sum, t) => sum + t.pnl, 0);
        const netProfit = totalProfit + totalLoss;

        // Update UI Text
        totalTradesEl.textContent = totalCount;
        posTradesEl.textContent = posTrades.length;
        negTradesEl.textContent = negTrades.length;

        const posRatio = ((posTrades.length / totalCount) * 100).toFixed(1);
        const negRatio = ((negTrades.length / totalCount) * 100).toFixed(1);
        posRatioEl.textContent = `${posRatio}%`;
        negRatioEl.textContent = `${negRatio}%`;

        totalProfitEl.textContent = totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2 });
        totalLossEl.textContent = totalLoss.toLocaleString(undefined, { minimumFractionDigits: 2 });
        netProfitEl.textContent = netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 });
        
        netProfitEl.className = `value ${netProfit >= 0 ? 'positive' : 'negative'}`;

        // Prepare Chart Data
        let cumulative = 0;
        const chartData = trades.map(t => {
            cumulative += t.pnl;
            return cumulative;
        });
        const labels = trades.map(t => t.id);

        renderChart(labels, chartData);
    }

    function renderChart(labels, data) {
        const ctx = document.getElementById('pnlChart').getContext('2d');
        
        if (pnlChart) {
            pnlChart.destroy();
        }

        pnlChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Cumulative P&L',
                    data: data,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.1,
                    pointRadius: 0,
                    hoverRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                scales: {
                    x: {
                        display: false
                    },
                    y: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.05)'
                        },
                        ticks: {
                            color: '#94a3b8',
                            font: { size: 10 }
                        }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }
});
