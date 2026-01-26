document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const dashboard = document.getElementById('dashboard');
    const emptyState = document.getElementById('empty-state');
    const toast = document.getElementById('toast');

    // State
    let globalIssues = [];

    // Chart Instances
    let lineChart = null;
    let resolutionChart = null;

    // Event Listeners
    // Configuration
    const REFRESH_INTERVAL_MS = 60000; // 60 Seconds
    const REPO_OWNER = 'Amey2003';
    const REPO_NAME = 'excel-issue-tracker';
    const ISSUE_NUMBER = 1; // UPDATE THIS IF NEEDED

    // Initialization
    fetchIssueData();
    startAutoRefresh();

    function startAutoRefresh() {
        setInterval(() => {
            fetchIssueData(false);
        }, REFRESH_INTERVAL_MS);
    }

    // Main Processing
    async function fetchIssueData(isManual = false) {
        // Show loading state ONLY on initial load (emptyState visible)
        if (emptyState && !dashboard.classList.contains('hidden') && !isManual) {
            // Silent update for auto-refresh
        } else if (isManual) {
            showToast("Refreshing data...");
        }

        // Initial Loading Screen
        if (emptyState && dashboard.classList.contains('hidden')) {
            emptyState.innerHTML = `
                <div class="upload-zone" style="border:none;">
                    <h2>Loading Data...</h2>
                    <p>Fetching latest issues from GitHub...</p>
                </div>
            `;
        }

        try {
            const response = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues/${ISSUE_NUMBER}`, {
                cache: 'no-store'
            });

            if (!response.ok) {
                if (response.status === 404) throw new Error("Issue not found. Check REPO settings.");
                throw new Error(`GitHub API Error: ${response.status}`);
            }

            const issueData = await response.json();

            // Parse the JSON content from the body
            // The body might be plain text, so we wrap it in a try/catch if strictly JSON is expected
            let jsonData;
            try {
                // Remove potential markdown code blocks if present (```json ... ```)
                const cleanBody = issueData.body.replace(/```json/g, '').replace(/```/g, '').trim();
                jsonData = JSON.parse(cleanBody);
            } catch (e) {
                console.error("JSON Parse Error:", e);
                console.log("Raw Body:", issueData.body);
                throw new Error("Failed to parse JSON from Issue Body.");
            }

            if (!Array.isArray(jsonData)) {
                throw new Error("Data format error: Expected an array of issues.");
            }

            // Map the API data to the format processData expects
            // "Sr no":"1","created_by":"Pranav.Patne","issue_title":"...","module_name":"Whole website","bug_type":"UI","severity":"Critical","state":"Fixed","assigned_to":"Pranav","bug_found":"20-01-2026 ","bug_fixed":"46044","fixed_by_method":"","fixed_by_name":"Jeevan","priority":"P0","product_comments":"P0 ","qa_comments":""

            const mappedData = jsonData.map(item => ({
                "Bug Type": item.bug_type,
                "Severity": item.severity,
                "State": item.state,
                "Assigned To": item.assigned_to,
                "Module": item.module_name,
                "Bug Found Date": item.bug_found,
                "Bug Fixed Date": item.bug_fixed,
                "Priority": item.priority // In case severity mapping uses this
            }));

            processData(mappedData);
            showDashboard();


            const timestamp = new Date().toLocaleTimeString();
            if (isManual) {
                showToast(`Data Refreshed: ${timestamp}`);
            } else if (!dashboard.classList.contains('hidden')) {
                showToast(`Auto-Refreshed: ${timestamp}`);
            } else {
                showToast(`Data Loaded: ${timestamp}`);
            }

        } catch (error) {
            console.error(error);
            if (emptyState) {
                emptyState.innerHTML = `
                    <div class="upload-zone" style="border-color: red;">
                        <h2 style="color: red;">Error Loading Data</h2>
                        <p>${error.message}</p>
                        <button class="btn primary-btn" onclick="location.reload()">Retry</button>
                    </div>
                `;
            }
        }
    }




    function showDashboard() {
        emptyState.classList.add('hidden');
        dashboard.classList.remove('hidden');
    }

    function showToast(msg) {
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }

    // Data Processing
    function processData(data) {
        // Normalization Helper
        const norm = (row, ...keys) => {
            const rowKeys = Object.keys(row);
            for (let key of keys) {
                const target = key.toLowerCase().trim();
                const actualKey = rowKeys.find(k => k.toLowerCase().trim() === target);
                if (actualKey) return row[actualKey];
            }
            return "Unknown";
        };



        // Store globally with normalized severity
        globalIssues = data.map(row => ({
            type: norm(row, "Bug Type", "Type", "Issue Type"),
            severity: normalizeSeverity(norm(row, "Severity", "Priority")),
            state: norm(row, "State", "Status"),
            assignee: norm(row, "Assigned To", "Developer", "Assignee", "Dev Name"),
            module: norm(row, "Module", "Component", "Feature", "Area"),
            fixedDate: norm(row, "Bug Fixed Date and Timestamp", "Bug Fixed Date", "Fixed Date", "Resolution Date", "Fixed On", "Closed Date", "Date Fixed"),
            foundDate: norm(row, "Bug Found Date", "Found Date", "Created Date", "Date Created", "Creation Date", "Raised Date", "Detected Date", "Date", "Reported Date", "Issue Date")
        }));


        renderDashboard();
    }

    function renderDashboard() {
        // 1. Always update tiles with FULL counts
        const counts = { Blocker: 0, Critical: 0, Major: 0, Normal: 0, Minor: 0 };
        globalIssues.forEach(issue => {
            if (issue.severity === "Blocker") counts.Blocker++;
            if (issue.severity === "Critical") counts.Critical++;
            if (issue.severity === "Major") counts.Major++;
            if (issue.severity === "Normal") counts.Normal++;
            if (issue.severity === "Minor") counts.Minor++;
        });
        updateTiles(counts);

        // KPI 1: Matrix (Now State vs Severity)
        const activeIssues = globalIssues.filter(i => {
            const s = String(i.state).toUpperCase();
            return ["ASSIGNED", "REOPEN", "RFT"].includes(s);
        });
        renderStateMatrix(activeIssues);
        renderBugMatrix(activeIssues);

        // KPI 2 & 3: Charts
        const activeDevIssues = globalIssues.filter(i => {
            const s = String(i.state).toUpperCase();
            const cleanState = s.replace(/\s/g, "");
            return ["ASSIGNED", "INDEV", "INPROGRESS", "REOPEN"].includes(cleanState);
        });

        renderDevMatrix(activeDevIssues);
        // Pass all issues initially for the Trend Chart

        // Populate filter for the Dev Matrix
        populateDateFilter(activeDevIssues, activeDevIssues); // Pass issues to extract dates from, and the source to filter

        // Trend Chart shows ALL Active Issues (unfiltered by the matrix dropdown)
        renderTrendChart(globalIssues, globalIssues.length);
        renderResolutionChart(globalIssues);
    }

    // Helper to parse date to a Date object (Shared)
    // Helper to parse date to a Date object (Shared)
    const parseToDate = (dateVal) => {
        if (!dateVal) return null;
        if (dateVal === "Unknown") return null;

        let d;
        if (typeof dateVal === 'number') {
            // Excel serial. Round to avoid precision errors, force to Local Noon
            d = new Date(Math.round((dateVal - 25569) * 86400 * 1000));
            d.setHours(12, 0, 0, 0);
        } else if (typeof dateVal === 'string') {
            const cleanStr = dateVal.trim();
            d = new Date(cleanStr);

            if (isNaN(d.getTime())) {
                const parts = cleanStr.split(/[\/\.\-]/);
                if (parts.length >= 3) {
                    const day = parseInt(parts[0]);
                    const month = parseInt(parts[1]) - 1;
                    let year = parseInt(parts[2]);
                    if (year < 100) year += 2000;
                    d = new Date(year, month, day);
                }
            }
            if (!isNaN(d.getTime())) {
                d.setHours(12, 0, 0, 0); // Force to Noon
            }
        } else {
            d = new Date(dateVal);
            if (!isNaN(d.getTime())) d.setHours(12, 0, 0, 0);
        }

        if (isNaN(d.getTime()) || d === null) return null;
        return d;
    };

    function populateDateFilter(issuesForDates, issuesToFilter) {
        const filterSelect = document.getElementById('devMatrixFilter');
        if (!filterSelect) return;

        // Extract unique dates
        const datesSet = new Set();
        issuesForDates.forEach(i => {
            const d = parseToDate(i.foundDate);
            if (d) {
                // Use Local YYYY-MM-DD
                const isoKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                datesSet.add(isoKey);
            }
        });

        const sortedDates = Array.from(datesSet).sort();

        // Clear and Repopulate
        filterSelect.innerHTML = '<option value="all">All Dates</option>';
        sortedDates.forEach(isoDate => {
            const option = document.createElement('option');
            option.value = isoDate;
            const d = new Date(isoDate);
            // Display as DD-MMM-YYYY
            option.textContent = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            filterSelect.appendChild(option);
        });

        // Event Listener for Matrix
        filterSelect.onchange = (e) => {
            const val = e.target.value;
            if (val === 'all') {
                renderDevMatrix(issuesToFilter);
            } else {
                // Filter by chosen found date
                const filtered = issuesToFilter.filter(i => {
                    const d = parseToDate(i.foundDate);
                    // Match against local key
                    if (!d) return false;
                    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                    return key === val;
                });
                renderDevMatrix(filtered);
            }
        };
    }

    function renderTrendChart(issuesToRender, totalSheetIssues) {
        // Debug: Log unique states to help troubleshoot "No Data"
        const uniqueStates = [...new Set(issuesToRender.map(i => String(i.state).toUpperCase().trim()))];


        // Filter for specific ACTIVE states
        const activeTrendIssues = issuesToRender.filter(i => {
            const s = String(i.state).toUpperCase().trim();

            // Allow for variations like "In Development", "Assigned", "Re-open"
            const isActive = s.includes("ASSIGNED") ||
                s.includes("DEV") ||      // Covers "In Dev", "In Development", "Dev"
                s.includes("REOPEN") ||   // Covers "ReOpen", "Re-open"
                s.includes("PROGRESS");   // Covers "In Progress"

            return isActive;
        });



        // Aggregation using Found Date
        const trendData = {};
        activeTrendIssues.forEach(i => {
            // Use foundDate instead of fixedDate
            const d = parseToDate(i.foundDate);
            if (d) {
                // Use Local YYYY-MM-DD keys
                const isoKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                trendData[isoKey] = (trendData[isoKey] || 0) + 1;
            }
        });

        const sortedIsoDates = Object.keys(trendData).sort();

        const displayLabels = sortedIsoDates.map(isoDate => {
            const d = new Date(isoDate);
            return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
        });

        const lineData = sortedIsoDates.map(date => trendData[date]);

        createChart('lineChart', 'line', {
            labels: displayLabels.length > 0 ? displayLabels : ['No Data'],
            datasets: [{
                label: 'Active Issues (Found)',
                data: lineData.length > 0 ? lineData : [0],
                borderColor: '#B24A58',
                borderWidth: 3,
                tension: 0.3,
                fill: true,
                backgroundColor: 'rgba(178, 74, 88, 0.1)',
                pointBackgroundColor: '#B24A58',
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        }, {
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#000000', maxRotation: 45, minRotation: 45, font: { size: 10 } },
                    border: { display: false }
                },
                y: {
                    beginAtZero: true,
                    // Dynamic max based on Total Sheet Count
                    max: totalSheetIssues > 0 ? totalSheetIssues : undefined,
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: { color: '#000000', font: { size: 10 } },
                    border: { display: false },
                    title: {
                        display: false
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return `Count: ${context.raw}`;
                        }
                    }
                }
            }
        });
    }

    function renderResolutionChart(issues) {
        // "Fixed" is written in the sheet of the State column
        // We want Resolved (Fixed) breakdown by Severity
        const total = issues.length;
        // Filter for Fixed/Resolved issues
        const fixedIssues = issues.filter(i => {
            const s = String(i.state).toUpperCase();
            return s === "FIXED" || s === "RESOLVED" || s === "CLOSED";
        });
        const fixedCount = fixedIssues.length;

        // Count by Severity
        const counts = { "Blocker": 0, "Critical": 0, "Major": 0, "Normal": 0, "Minor": 0 };
        fixedIssues.forEach(i => {
            // severity is already normalized in globalIssues
            if (counts[i.severity] !== undefined) {
                counts[i.severity]++;
            }
        });

        const severities = ["Blocker", "Critical", "Major", "Normal", "Minor"];
        const dataValues = severities.map(s => counts[s]);

        // Colors from style.css (or consistent with getSevColor)
        const bgColors = severities.map(s => getSevColor(s));

        const data = {
            labels: severities,
            datasets: [{
                data: dataValues,
                backgroundColor: bgColors,
                borderWidth: 0,
                hoverOffset: 4
            }]
        };

        const centerText = {
            id: 'centerText',
            beforeDraw: function (chart) {
                if (chart.config.type !== 'doughnut') return;
                const { ctx, chartArea: { top, bottom, left, right, width, height } } = chart;
                ctx.save();
                ctx.font = 'bold 18px Outfit';
                ctx.fillStyle = '#000000';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const text = `${fixedCount}`;
                // Draw in the middle of the chart area (excluding legend space)
                // Chart.js donut charts center themselves in the available area
                const x = left + width / 2;
                const y = top + height / 2;
                ctx.fillText(text, x, y);
                ctx.restore();
            }
        };

        createChart('resolutionChart', 'doughnut', data, {
            cutout: '70%',
            rotation: 0,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        boxWidth: 8,
                        padding: 10,
                        usePointStyle: true,
                        pointStyle: 'circle',
                        font: { size: 11, family: "'Outfit', sans-serif" }
                    }
                },
                title: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const label = context.label || '';
                            const value = context.raw || 0;
                            return `${label}: ${value} (of ${fixedCount} fixed)`;
                        }
                    }
                }
            }
        }, [centerText]);
    }

    function updateTiles(counts) {
        // Animate numbers
        animateValue("blocker-count", counts.Blocker);
        animateValue("critical-count", counts.Critical);
        animateValue("p1-count", counts.Major);
        animateValue("p2-count", counts.Normal);
        animateValue("p3-count", counts.Minor);
    }

    function animateValue(id, value) {
        const obj = document.getElementById(id);
        const start = parseInt(obj.innerHTML);
        if (start === value) return;
        obj.innerHTML = value;
        // Simple instant update for now, can add tweening later if needed
    }

    // Matrix Rendering (State vs Severity)
    function renderStateMatrix(issues) {
        const container = document.getElementById('stateMatrix');

        // predefined State Order
        const stateOrder = ["Assigned", "In Dev", "RFT", "Fixed", "Reopen"];
        // Get all unique states present in data or use default list + extras
        const presentStates = [...new Set(issues.map(i => i.state))];

        // Merge and Sort
        const finalStates = stateOrder.filter(s => presentStates.includes(s) ||
            presentStates.some(ps => ps.toLowerCase() === s.toLowerCase()));

        // Add any other states found in data that are not in the predefined list
        presentStates.forEach(s => {
            const normalized = stateOrder.find(so => so.toLowerCase() === s.toLowerCase());
            if (!normalized && !finalStates.includes(s)) {
                finalStates.push(s);
            }
        });

        renderGenericMatrix(container, issues, finalStates, "state", "State");
    }

    // NEW: Bug Matrix Rendering (Bug Type vs Severity)
    function renderBugMatrix(issues) {
        const container = document.getElementById('bugTypeMatrix');
        // Get unique Bug Types (Rows)
        const bugTypes = [...new Set(issues.map(i => i.type))].sort();
        renderGenericMatrix(container, issues, bugTypes, "type", "Bug Type");
    }

    // NEW: Developer Workload Matrix
    function renderDevMatrix(issues) {
        const container = document.getElementById('devMatrixContainer');
        const devs = [...new Set(issues.map(i => i.assignee))].filter(d => d !== "Unknown").sort();
        renderGenericMatrix(container, issues, devs, "assignee", "Developer");
    }

    // Generic Helper to render the matrix structure
    function renderGenericMatrix(container, issues, rows, rowKey, rowLabelHeader) {
        const severities = ["Blocker", "Critical", "Major", "Normal", "Minor"];
        const shortSev = {
            "Blocker": "Blocker",
            "Critical": "Critical",
            "Major": "Major",
            "Normal": "Normal",
            "Minor": "Minor"
        };


        const matrix = {};
        const rowTotals = {};
        const colTotals = { "Blocker": 0, "Critical": 0, "Major": 0, "Normal": 0, "Minor": 0, "Total": 0 };
        rows.forEach(t => {
            matrix[t] = { "Blocker": 0, "Critical": 0, "Major": 0, "Normal": 0, "Minor": 0 };
            rowTotals[t] = 0;
        });

        issues.forEach(i => {
            const sev = normalizeSeverity(i.severity);
            const rowVal = i[rowKey];
            let key = rowVal;
            if (rowKey === "state") {
                key = rows.find(fs => fs.toLowerCase() === rowVal.toLowerCase()) || rowVal;
            }
            if (matrix[key]) {
                matrix[key][sev]++;
                rowTotals[key]++;
                colTotals[sev]++;
                colTotals["Total"]++;
            }
        });

        let html = '<table class="matrix-table image-style">';
        html += `<thead><tr><th class="th-start">${rowLabelHeader}</th>`;
        severities.forEach(sev => {
            html += `<th class="th-sev th-${sev.toLowerCase()}">${shortSev[sev]}</th>`;
        });
        html += '<th class="th-tot">Total</th></tr></thead>';
        html += '<tbody>';
        rows.forEach(r => {
            html += `<tr><td class="td-label">${r}</td>`;
            severities.forEach(sev => {
                const count = matrix[r][sev];
                let cellHtml = count > 0 ? `<div class="pill pill-${sev.toLowerCase()}">${count}</div>` : `<span class="zero">${count}</span>`;
                html += `<td class="td-val">${cellHtml}</td>`;
            });
            html += `<td class="td-tot" style="color: #000000; font-weight: 700;">${rowTotals[r]}</td></tr>`;
        });
        html += '<tr class="tr-total"><td class="td-label-total">Total</td>';
        severities.forEach(sev => {
            const count = colTotals[sev];
            let cellHtml = count > 0 ? `<span class="tot-val tot-${sev.toLowerCase()}">${count}</span>` : `<span class="zero-bold">${count}</span>`;
            html += `<td class="td-val-total">${cellHtml}</td>`;
        });
        html += `<td class="td-grand-total"><div class="pill pill-grand">${colTotals.Total}</div></td></tr>`;
        html += '</tbody></table>';
        container.innerHTML = html;
    }

    // Chart Rendering
    function setupChartDefaults() {
        Chart.defaults.color = '#000000'; // Black
        Chart.defaults.font.family = "'Outfit', sans-serif";
        Chart.defaults.font.size = 11;
    }

    // This function now only sets up defaults and provides helper for colors
    function renderCharts() {
        setupChartDefaults();
    }

    function createChart(canvasId, type, data, options, plugins = []) {
        const c = document.getElementById(canvasId);
        // If element missing (maybe removed), skip
        if (!c) return;

        const ctx = c.getContext('2d');

        // Destroy existing if needed
        if (canvasId === 'lineChart' && lineChart) lineChart.destroy();
        if (canvasId === 'resolutionChart' && resolutionChart) resolutionChart.destroy();

        const chart = new Chart(ctx, {
            type: type,
            data: data,
            plugins: plugins,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#000000' } } // Black
                },
                ...options
            }
        });

        if (canvasId === 'lineChart') lineChart = chart;
        if (canvasId === 'resolutionChart') resolutionChart = chart;
    }

    function getSevColor(sev) {
        switch (sev) {
            case "Blocker": return '#B24A58';
            case "Critical": return '#F599A2';
            case "Major": return '#FBD0A5';
            case "Normal": return '#FCFEA8';
            case "Minor": return '#E4F3F3';
            default: return '#94a3b8';
        }
    }

    function normalizeSeverity(s) {
        s = String(s).toUpperCase();
        if (s.includes("BLOCKER")) return "Blocker";
        if (s.includes("P0") || s.includes("CRITICAL")) return "Critical";
        if (s.includes("P1") || s.includes("MAJOR")) return "Major";
        if (s.includes("P2") || s.includes("NORMAL")) return "Normal";
        return "Minor";
    }


});
