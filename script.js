// Global variable to track display mode
let displayMode = 'apr'; // Default to APR view

// Global variable to remember chart type selection
let selectedChartType = 'bar'; // Default to column chart (the only type now)

// Global variable to remember chart range selection
let selectedChartRange = '1d'; // Default to 1 day

// Global variable to track if volume data should be shown in chart
let showVolumeData = false; // Default to not showing volume data

// Global variable to track if price data should be shown in chart
let showPriceData = false; // Default to not showing price data

// Global array to track the order of active charts (funding is always first)
let chartOrder = ['funding'];

// Global variable to track ADV range in days
let advRangeDays = 30; // Default to 30 days

// Global variables for chart data and options
let chartData = null;
let chartOptions = null;

// Global variable to track mouse position for hover effects
let mouseX = 0;
let mouseY = 0;

// Global variables for tracking hover state across charts
let hoverIndex = -1;
let isMouseOverChart = false;
let activeChartId = null;

// Global variable to store current coin being viewed
let currentCoin = null;

// Format ADV (Average Daily Volume) for display
function formatADV(adv) {
    if (adv === null || adv === undefined) {
        return '<span class="no-data">Not enough data</span>';
    }
    
    // Format with appropriate suffix (K, M, B)
    if (adv >= 1000000000) {
        return '$' + (adv / 1000000000).toFixed(2) + 'B';
    } else if (adv >= 1000000) {
        return '$' + (adv / 1000000).toFixed(2) + 'M';
    } else if (adv >= 1000) {
        return '$' + (adv / 1000).toFixed(2) + 'K';
    } else {
        return '$' + adv.toFixed(2);
    }
}

// Format funding rate for display
function formatRate(rate, mode = displayMode) {
    if (rate === null || rate === undefined) {
        return '<span class="no-data">Not enough data</span>';
    }
    
    let formattedRate;
    if (mode === 'apr') {
        // APR mode - annualized
        formattedRate = rate.toFixed(2) + '%';
    } else {
        // Hourly mode - convert from annualized back to hourly
        const hourlyRate = rate / (24 * 365);
        formattedRate = hourlyRate.toFixed(6) + '%';
    }
    
    // Add appropriate class based on value
    if (rate < 0) {
        return '<span class="negative-rate">' + formattedRate + '</span>';
    } else if (rate > 0) {
        // Check if rate is in the "low positive" range (0% to 10.95% APR)
        // 10.95% APR = 0.00125% hourly
        if (rate <= 10.951) { // Slightly higher threshold to account for floating-point precision
            return '<span class="low-positive-rate">' + formattedRate + '</span>';
        } else {
            return '<span class="positive-rate">' + formattedRate + '</span>';
        }
    } else {
        return formattedRate;
    }
}

// Format coin name with hyperlink to Hyperliquid trading page
function formatCoinName(coin, isNew = false, isDelisted = false) {
    const url = `https://app.hyperliquid.xyz/trade/${coin}`;
    let coinClass = '';
    let label = '';
    
    if (isNew) {
        coinClass = 'new-coin';
        // The "(new)" label is added via CSS in the .new-coin::after
    } else if (isDelisted) {
        coinClass = 'delisted-coin';
        label = ' (delisted)';
    }
    
    return `<div class="coin-container">
              <button class="coin-info-button" data-coin="${coin}" title="Coin Info"></button>
              <a href="${url}" target="_blank" class="coin-link ${coinClass}"><strong>${coin}</strong>${label}</a>
            </div>`;
}

// Combine all data into a single dataset with one row per coin
function combineData(data) {
    // Get all unique coins from all datasets
    const allCoins = new Set();
    
    // Add coins from current data
    if (data.positive_current) {
        data.positive_current.forEach(item => allCoins.add(item.coin));
    }
    if (data.negative_current) {
        data.negative_current.forEach(item => allCoins.add(item.coin));
    }
    
    // Add coins from average data
    ['1d', '3d', '5d'].forEach(period => {
        if (data[`positive_${period}`]) {
            data[`positive_${period}`].forEach(item => allCoins.add(item.coin));
        }
        if (data[`negative_${period}`]) {
            data[`negative_${period}`].forEach(item => allCoins.add(item.coin));
        }
    });
    
    // Create a map for quick lookups
    const currentRates = {};
    
    // Combine positive and negative current rates
    if (data.positive_current) {
        data.positive_current.forEach(item => {
            currentRates[item.coin] = item.fundingRate_annualized;
        });
    }
    if (data.negative_current) {
        data.negative_current.forEach(item => {
            currentRates[item.coin] = item.fundingRate_annualized;
        });
    }
    
    // Create maps for average rates
    const avgRates = {
        '1d': {},
        '3d': {},
        '5d': {}
    };
    
    // Create a map for ADV data
    const advValues = {};
    
    // If ADV data exists, get the values for the currently selected range
    if (data.adv_data && data.adv_data[`${advRangeDays}d`]) {
        advValues.current = data.adv_data[`${advRangeDays}d`];
    }
    
    // Create a map for tracking which coins are new
    const newCoins = {};
    
    // Populate average rate maps
    ['1d', '3d', '5d'].forEach(period => {
        if (data[`positive_${period}`]) {
            data[`positive_${period}`].forEach(item => {
                avgRates[period][item.coin] = item[`fundingRate_avg_${period}`];
                // Store the isNew flag if present
                if (item.isNew !== undefined) {
                    newCoins[item.coin] = item.isNew;
                }
            });
        }
        if (data[`negative_${period}`]) {
            data[`negative_${period}`].forEach(item => {
                avgRates[period][item.coin] = item[`fundingRate_avg_${period}`];
                // Store the isNew flag if present
                if (item.isNew !== undefined) {
                    newCoins[item.coin] = item.isNew;
                }
            });
        }
    });
    
    // Also check for isNew flag in current data
    if (data.positive_current) {
        data.positive_current.forEach(item => {
            if (item.isNew !== undefined) {
                newCoins[item.coin] = item.isNew;
            }
        });
    }
    if (data.negative_current) {
        data.negative_current.forEach(item => {
            if (item.isNew !== undefined) {
                newCoins[item.coin] = item.isNew;
            }
        });
    }
    
    // Create the combined dataset
    const combinedData = [];
    
    // Create data rows
    allCoins.forEach(coin => {
        // Use the isNew flag from the server if available,
        // otherwise fall back to the old logic as a backup
        let isNewCoin = newCoins[coin];
        
        // Fallback logic if server didn't provide isNew flag
        if (isNewCoin === undefined) {
            isNewCoin = avgRates['5d'][coin] === undefined || avgRates['5d'][coin] === null;
            console.warn(`Missing isNew flag for coin ${coin}, using fallback detection`);
        }
        
        // Get the ADV value for the current range if available
        let advValue = null;
        if (advValues.current && advValues.current[coin] !== undefined) {
            advValue = advValues.current[coin];
        }
        
        // Determine if coin is delisted - has 5d data but missing 1d data
        const has5dData = avgRates['5d'][coin] !== undefined && avgRates['5d'][coin] !== null;
        const missing1dData = !avgRates['1d'][coin] || avgRates['1d'][coin] === null;
        const isDelisted = has5dData && missing1dData && !isNewCoin;
        
        combinedData.push({
            coin: coin,
            isNew: isNewCoin,
            isDelisted: isDelisted,
            adv: advValue,  // Add ADV data
            latestRate: currentRates[coin] || null,
            avg1d: avgRates['1d'][coin] || null,
            avg3d: avgRates['3d'][coin] || null,
            avg5d: avgRates['5d'][coin] || null
        });
    });
    
    return combinedData;
}

// Initialize and populate the main table
function initializeTable(data) {
    const combinedData = combineData(data);
    let table;
    
    // Register custom sorting function for null values in funding rate columns
    $.fn.dataTable.ext.type.order['funding-rate-pre'] = function(data) {
        // Extract the actual value from the HTML
        if (data.includes('Not enough data')) {
            // Return extreme value depending on current sort direction (will be placed at end)
            return null;
        }
        // Extract the numeric value from the formatted rate
        const match = data.match(/-?\d+\.\d+/);
        return match ? parseFloat(match[0]) : 0;
    };
    
    // Register custom sorting function for ADV column
    $.fn.dataTable.ext.type.order['adv-pre'] = function(data) {
        // Extract the actual value from the HTML
        if (data.includes('Not enough data')) {
            // Return extreme negative value to place it at the end when sorting
            return null;
        }
        // Extract the numeric value from the formatted ADV
        if (data.includes('B')) {
            const match = data.match(/\$(\d+\.\d+)B/);
            return match ? parseFloat(match[1]) * 1000000000 : 0;
        } else if (data.includes('M')) {
            const match = data.match(/\$(\d+\.\d+)M/);
            return match ? parseFloat(match[1]) * 1000000 : 0;
        } else if (data.includes('K')) {
            const match = data.match(/\$(\d+\.\d+)K/);
            return match ? parseFloat(match[1]) * 1000 : 0;
        } else {
            const match = data.match(/\$(\d+\.\d+)/);
            return match ? parseFloat(match[1]) : 0;
        }
    };
    
    // Initialize DataTable
    table = $('#fundingTable').DataTable({
        data: combinedData,
        columns: [
            { 
                data: 'coin',
                title: 'Coin',
                render: function(data, type, row) {
                    return formatCoinName(data, row.isNew, row.isDelisted);
                }
            },
            {
                data: 'adv',
                title: `ADV (${advRangeDays}d)`,
                type: 'adv',  // Use our custom type for sorting
                render: function(data) {
                    return formatADV(data);
                }
            },
            { 
                data: 'latestRate', 
                title: 'Latest Funding',
                type: 'funding-rate',
                render: function(data) {
                    return formatRate(data, displayMode);
                }
            },
            { 
                data: 'avg1d', 
                title: '1-Day Carry',
                type: 'funding-rate',
                render: function(data) {
                    return formatRate(data, displayMode);
                }
            },
            { 
                data: 'avg3d', 
                title: '3-Day Carry',
                type: 'funding-rate',
                render: function(data) {
                    return formatRate(data, displayMode);
                }
            },
            { 
                data: 'avg5d', 
                title: '5-Day Carry',
                type: 'funding-rate',
                render: function(data) {
                    return formatRate(data, displayMode);
                }
            }
        ],
        order: [[2, 'desc']], // Sort by latest funding rate by default (now column index 2 since we added ADV)
        responsive: true,
        paging: false,
        scrolling: false,
        info: true,
        searching: true, // Enable searching
        language: {
            info: "Showing _TOTAL_ coins",
            infoEmpty: "No coins found",
            infoFiltered: "(filtered from _MAX_ total coins)"
        },
        // Custom order callback for null-safe sorting on numeric columns
        columnDefs: [
            {
                targets: [1, 2, 3, 4, 5], // Apply to ADV and all funding rate columns
                createdCell: function(cell, cellData, rowData, rowIndex, colIndex) {
                    // Add a custom attribute to cells with null values for easier identification
                    if (cellData === null || cellData === undefined) {
                        $(cell).addClass('null-value');
                    }
                }
            }
        ]
    });
    
    // Override default DataTable sorting to handle null values properly
    table.on('order.dt', function() {
        const order = table.order();
        const columnIndex = order[0][0];
        const direction = order[0][1];
        
        // Apply custom sorting for ADV column (1) and funding rate columns (2-5)
        if (columnIndex >= 1 && columnIndex <= 5) {
            // Get all rows with null values in the sorted column
            const nullRows = table.rows().nodes().toArray().filter(function(node) {
                return $(node).find('td').eq(columnIndex).hasClass('null-value');
            });
            
            // If we have any null rows, move them to the end
            if (nullRows.length > 0) {
                // Remove the null rows from their current position
                $(nullRows).detach();
                
                // Append them at the end of the table
                $(table.table().body()).append(nullRows);
            }
        }
    });
    
    // Connect custom search box to DataTable search
    $('#coinSearch').on('keyup', function() {
        table.search(this.value).draw();
    });
    
    // Handle display mode change
    $('#displayMode').on('change', function() {
        displayMode = $(this).val();
        updateTableTitle();
        
        // Force redraw of the table with the new display mode
        table.rows().invalidate('data').draw();
        
        // Update chart if it exists
        if (window.fundingChart) {
            window.fundingChart.update();
        }
    });
    
    // Add event listener for coin info buttons
    $('#fundingTable').on('click', '.coin-info-button', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const coin = $(this).data('coin');
        showCoinInfoPopup(coin);
    });
    
    // Initial table title update
    updateTableTitle();
    
    return table;
}

// Update the table title based on display mode
function updateTableTitle() {
    const titleSuffix = displayMode === 'apr' ? '(Annualized %)' : '(Hourly %)';
    $('h2').text(`Funding Rates Overview ${titleSuffix}`);
}

// Modal functionality
function setupModal() {
    const modal = document.getElementById('helpModal');
    const btn = document.getElementById('helpBtn');
    const span = document.getElementsByClassName('close')[0];
    
    // Open modal when help button is clicked
    btn.onclick = function() {
        modal.style.display = 'block';
    }
    
    // Close modal when X is clicked
    span.onclick = function() {
        modal.style.display = 'none';
    }
    
    // Close modal when clicking outside of it
    window.onclick = function(event) {
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    }
    
    // Close modal when ESC key is pressed
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && modal.style.display === 'block') {
            modal.style.display = 'none';
        }
    });
}

// Function to show coin info popup with funding history chart
function showCoinInfoPopup(coin) {
    // Create popup element if it doesn't exist
    if (!$('#coinInfoPopup').length) {
        $('body').append(`
            <div id="coinInfoPopup" class="coin-info-popup">
                <div class="coin-info-popup-content">
                    <span class="coin-info-popup-close">&times;</span>
                    <div class="popup-header">
                        <div class="chart-type-container">
                            <div class="data-toggle-container">
                                <div class="data-toggle-row">
                                    <button id="fundingToggle" class="coin-info-button active" title="Funding Data" disabled></button>
                                    <span class="toggle-label">Funding</span>
                                </div>
                                <div class="data-toggle-row">
                                    <button id="volumeToggle" class="coin-info-button" title="Volume Data"></button>
                                    <span class="toggle-label">Volume</span>
                                </div>
                                <div class="data-toggle-row">
                                    <button id="priceToggle" class="coin-info-button" title="Price Data"></button>
                                    <span class="toggle-label">Price</span>
                                </div>
                            </div>
                        </div>
                        <h3 id="coinInfoPopupTitle"></h3>
                        <div class="chart-range-container">
                            <select id="chartRangeSelect" class="chart-type-select">
                                <option value="1d" selected>1d</option>
                                <option value="1w">1w</option>
                                <option value="2w">2w</option>
                                <option value="1m">1m</option>
                                <option value="2m">2m</option>
                                <option value="3m">3m</option>
                            </select>
                        </div>
                    </div>
                    <div id="coinInfoPopupContent">
                        <div class="resizable-chart-container">
                            <div class="chart-container" id="fundingChartContainer">
                                <canvas id="fundingHistoryChart"></canvas>
                                <div class="resize-handle" data-chart="funding"></div>
                            </div>
                            <div id="chartLoading" class="chart-loading">Loading funding data...</div>
                        </div>
                    </div>
                    <div id="volumeChartContainer" class="volume-chart-container" style="display: none;">
                        <div class="resizable-chart-container">
                            <div class="chart-container">
                                <canvas id="volumeHistoryChart"></canvas>
                                <div class="resize-handle" data-chart="volume"></div>
                            </div>
                            <div id="volumeChartLoading" class="chart-loading">Loading volume data...</div>
                        </div>
                    </div>
                    <div id="priceChartContainer" class="price-chart-container" style="display: none;">
                        <div class="resizable-chart-container">
                            <div class="chart-container">
                                <canvas id="priceHistoryChart"></canvas>
                                <div class="resize-handle" data-chart="price"></div>
                            </div>
                            <div id="priceChartLoading" class="chart-loading">Loading price data...</div>
                        </div>
                    </div>
                </div>
            </div>
        `);
        
        // Add close button functionality
        $(document).on('click', '.coin-info-popup-close', function() {
            $('#coinInfoPopup').hide();
            // Remove active class from all buttons when popup is closed
            $('.coin-info-button[data-coin]').removeClass('active');
            
            // Clean up mobile chart range buttons and popups
            $('.mobile-chart-range-button').remove();
            $('.mobile-popup-container').each(function() {
                if ($(this).data('for') === 'chartRangeSelect') {
                    $(this).remove();
                }
            });
        });
        
        // Initialize chart resizing for the popup
        setupChartResizing();
        
        // Close popup when clicking outside
        $(document).on('click', function(e) {
            // Don't close if clicking on mobile popup menu elements or chart range selector
            if ($(e.target).closest('.mobile-popup-container').length > 0 || 
                $(e.target).hasClass('mobile-chart-range-button') ||
                $(e.target).closest('.mobile-chart-range-button').length > 0) {
                return;
            }
            
            if ($(e.target).closest('.coin-info-popup-content').length === 0 && 
                !$(e.target).hasClass('coin-info-button')) {
                $('#coinInfoPopup').hide();
                // Remove active class from all buttons when popup is closed
                $('.coin-info-button[data-coin]').removeClass('active');
                
                // Clean up mobile chart range buttons and popups
                $('.mobile-chart-range-button').remove();
                $('.mobile-popup-container').each(function() {
                    if ($(this).data('for') === 'chartRangeSelect') {
                        $(this).remove();
                    }
                });
            }
        });
        
        // Add volume toggle functionality
        $(document).on('click', '#volumeToggle', function() {
            $(this).toggleClass('active');
            showVolumeData = $(this).hasClass('active');
            
            // Show or hide the volume chart container based on toggle state
            if (showVolumeData) {
                // Add volume to the chart order if not already there
                if (!chartOrder.includes('volume')) {
                    chartOrder.push('volume');
                }
                
                $('#volumeChartContainer').show();
                // Load volume data if it hasn't been loaded yet or needs to be refreshed
                loadVolumeData(currentCoin, selectedChartRange);
                
                // Ensure chart is properly sized after showing
                setTimeout(function() {
                    if (window.volumeChart) {
                        window.volumeChart.resize();
                    }
                }, 100);
                
                // Reorder chart containers based on the current order
                reorderChartContainers();
            } else {
                $('#volumeChartContainer').hide();
                
                // Remove volume from the chart order
                chartOrder = chartOrder.filter(type => type !== 'volume');
            }
        });
        
        // Add price toggle functionality
        $(document).on('click', '#priceToggle', function() {
            $(this).toggleClass('active');
            showPriceData = $(this).hasClass('active');
            
            // Show or hide the price chart container based on toggle state
            if (showPriceData) {
                // Add price to the chart order if not already there
                if (!chartOrder.includes('price')) {
                    chartOrder.push('price');
                }
                
                $('#priceChartContainer').show();
                // Load price data from the volume data source
                loadPriceData(currentCoin, selectedChartRange);
                
                // Ensure chart is properly sized after showing
                setTimeout(function() {
                    if (window.priceChart) {
                        window.priceChart.resize();
                    }
                }, 100);
                
                // Reorder chart containers based on the current order
                reorderChartContainers();
            } else {
                $('#priceChartContainer').hide();
                
                // Remove price from the chart order
                chartOrder = chartOrder.filter(type => type !== 'price');
            }
        });
    }

    // Store the current coin for reference
    currentCoin = coin;
    
    // Ensure the chart container and canvas are reset
    const chartContainer = $('#coinInfoPopupContent');
    
    // Make sure we have both the loading indicator and the chart canvas
    if (!$('#chartLoading').length) {
        chartContainer.append('<div id="chartLoading" class="chart-loading">Loading funding data...</div>');
    }
    
    if (!$('#fundingHistoryChart').length) {
        chartContainer.prepend('<div class="chart-container"><canvas id="fundingHistoryChart"></canvas></div>');
    }
    
    // Reset any previous error messages
    $('.error-message').remove();
    
    // Show the chart container and canvas
    $('.chart-container').show();
    
    // Set the volume toggle state to match the global setting
    if (showVolumeData) {
        $('#volumeToggle').addClass('active');
        $('#volumeChartContainer').show();
    } else {
        $('#volumeToggle').removeClass('active');
        $('#volumeChartContainer').hide();
    }
    
    // Set the price toggle state to match the global setting
    if (showPriceData) {
        $('#priceToggle').addClass('active');
        $('#priceChartContainer').show();
    } else {
        $('#priceToggle').removeClass('active');
        $('#priceChartContainer').hide();
    }
    
    // Set the chart range select to match the global selection
    $('#chartRangeSelect').val(selectedChartRange);
    
    // Clean up any existing mobile chart range buttons and popups
    $('.mobile-chart-range-button').remove();
    $('.mobile-popup-container').each(function() {
        if ($(this).data('for') === 'chartRangeSelect') {
            $(this).remove();
        }
    });
    
    // Create mobile-friendly popup menu for chart range selector
    createMobilePopupMenu('chartRangeSelect', 'mobile-chart-range-button');
    
    // Set popup title
    $('#coinInfoPopupTitle').text(`${coin} Funding History`);
    
    // Show loading indicator
    $('#chartLoading').show();
    
    // Remove active class from all buttons first
    $('.coin-info-button[data-coin]').removeClass('active');
    
    // Add active class to the clicked button
    $(`.coin-info-button[data-coin="${coin}"]`).addClass('active');
    
    // Show popup
    $('#coinInfoPopup').show();
    
    // Load chart data with the selected range
    loadChartData(coin, selectedChartRange);
    
    // If volume toggle is active, also load volume data
    if (showVolumeData) {
        loadVolumeData(coin, selectedChartRange);
    }
    
    // Add event listener for chart range selection
    $('#chartRangeSelect').off('change').on('change', function() {
        const rangeValue = $(this).val();
        console.log(`Range selected: ${rangeValue}`);
        selectedChartRange = rangeValue; // Update the global variable
        
        // Reset any previous error messages
        $('.error-message').remove();
        
        // Show the chart container again (in case it was hidden by an error)
        $('.chart-container').show();
        
        // Show loading indicator during range change
        $('#chartLoading').show();
        
        // Reload the funding chart data with the new range
        loadChartData(coin, selectedChartRange);
        
        // If volume toggle is active, also reload volume data
        if (showVolumeData) {
            $('#volumeChartLoading').show();
            loadVolumeData(coin, selectedChartRange);
        }
        
        // If price toggle is active, also reload price data
        if (showPriceData) {
            $('#priceChartLoading').show();
            loadPriceData(coin, selectedChartRange);
        }
        
        // Update mobile popup menu to reflect the new selection
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (isMobile) {
            // Remove existing button and popup
            $('.mobile-chart-range-button').remove();
            $('.mobile-popup-container').each(function() {
                if ($(this).data('for') === 'chartRangeSelect') {
                    $(this).remove();
                }
            });
            
            // Create new popup with updated selection
            createMobilePopupMenu('chartRangeSelect', 'mobile-chart-range-button');
        }
    });
}

// Function to load chart data based on the selected range
function loadChartData(coin, range) {
    // Show loading indicator
    $('#chartLoading').show();
    
    // Update popup title with the range
    $('#coinInfoPopupTitle').text(`${coin} Funding History (${range.toUpperCase()})`);
    
    // Calculate the time range based on the selected range
    const now = Date.now();
    let startTime;
    
    switch (range) {
        case '1d':
            startTime = now - (24 * 60 * 60 * 1000); // 1 day in milliseconds
            break;
        case '1w':
            startTime = now - (7 * 24 * 60 * 60 * 1000); // 1 week in milliseconds
            break;
        case '2w':
            startTime = now - (14 * 24 * 60 * 60 * 1000); // 2 weeks in milliseconds
            break;
        case '1m':
            startTime = now - (30 * 24 * 60 * 60 * 1000); // 1 month (approx) in milliseconds
            break;
        case '2m':
            startTime = now - (60 * 24 * 60 * 60 * 1000); // 2 months (approx) in milliseconds
            break;
        case '3m':
            startTime = now - (90 * 24 * 60 * 60 * 1000); // 3 months (approx) in milliseconds
            break;
        default:
            startTime = now - (24 * 60 * 60 * 1000); // Default to 1 day
    }
    
    // Fetch the JSON data for current rates and averages
    $.getJSON('funding_data.json', function(jsonData) {
        console.log("JSON data loaded successfully");
        
        // Get current funding rate
        let currentRate = null;
        if (jsonData.positive_current) {
            const entry = jsonData.positive_current.find(item => item.coin === coin);
            if (entry) currentRate = entry.fundingRate_annualized;
        }
        if (currentRate === null && jsonData.negative_current) {
            const entry = jsonData.negative_current.find(item => item.coin === coin);
            if (entry) currentRate = entry.fundingRate_annualized;
        }
        
        // Get historical averages
        const oneDay = jsonData.positive_1d?.find(item => item.coin === coin)?.fundingRate_avg_1d || 
                      jsonData.negative_1d?.find(item => item.coin === coin)?.fundingRate_avg_1d;
        
        const threeDay = jsonData.positive_3d?.find(item => item.coin === coin)?.fundingRate_avg_3d || 
                        jsonData.negative_3d?.find(item => item.coin === coin)?.fundingRate_avg_3d;
        
        const fiveDay = jsonData.positive_5d?.find(item => item.coin === coin)?.fundingRate_avg_5d || 
                       jsonData.negative_5d?.find(item => item.coin === coin)?.fundingRate_avg_5d;
        
        console.log(`${coin} rates - Current: ${currentRate}, 1d: ${oneDay}, 3d: ${threeDay}, 5d: ${fiveDay}`);
        
        // Now fetch the CSV file to get hourly data
        $.ajax({
            url: '../funding_data_all_coins.csv', // Try to access the file in the root directory
            dataType: 'text',
            success: function(csvData) {
                console.log("CSV data loaded successfully");
                
                // Parse CSV data
                const rows = csvData.split('\n');
                console.log(`CSV has ${rows.length} rows`);
                
                // Try to detect CSV format
                const firstRow = rows[0].split(',');
                console.log(`CSV columns: ${firstRow.join(', ')}`);
                
                // Find column indices
                const coinIndex = firstRow.indexOf('coin');
                const rateIndex = firstRow.indexOf('fundingRate');
                const timeIndex = firstRow.indexOf('time');
                
                if (coinIndex >= 0 && rateIndex >= 0 && timeIndex >= 0) {
                    // Filter data for the selected coin and time range
                    const coinData = [];
                    const timeLabels = [];
                    const timestamps = [];
                    
                    // Process each row
                    for (let i = 1; i < rows.length; i++) {
                        if (!rows[i].trim()) continue; // Skip empty rows
                        
                        const columns = rows[i].split(',');
                        if (columns.length <= Math.max(coinIndex, rateIndex, timeIndex)) continue;
                        
                        const rowCoin = columns[coinIndex];
                        const fundingRate = parseFloat(columns[rateIndex]);
                        const timestamp = parseInt(columns[timeIndex]);
                        
                        if (rowCoin === coin && timestamp >= startTime && !isNaN(fundingRate) && !isNaN(timestamp)) {
                            // Convert funding rate to percentage and annualize it
                            // Hourly funding rate * 24 * 365 = APR
                            const fundingRateAPR = fundingRate * 24 * 365 * 100;
                            
                            // Format time as hour
                            // Shift time back by 1 hour to show the start of the collection period
                            const date = new Date(timestamp);
                            date.setHours(date.getHours() - 1);
                            const timeLabel = date.toLocaleString([], {
                                hour: '2-digit',
                                hour12: true,
                                day: '2-digit',
                                month: '2-digit'
                            });
                            
                            coinData.push(fundingRateAPR);
                            timeLabels.push(timeLabel);
                            timestamps.push(timestamp);
                        }
                    }
                    
                    // Hide loading indicator
                    $('#chartLoading').hide();
                    
                    if (coinData.length === 0) {
                        // No data found for this coin in the selected range
                        $('.chart-container').hide(); // Hide the chart container
                        $('#coinInfoPopupContent').append(`<p class="error-message">No funding data available for ${coin} in the selected range (${range}).</p>`);
                        return;
                    } else {
                        // Remove any previous error messages
                        $('.error-message').remove();
                        $('.chart-container').show(); // Make sure chart is visible
                    }
                    
                    console.log(`Found ${coinData.length} data points for ${coin} in range ${range}`);
                    
                    // Sort data by timestamp (oldest first)
                    const sortedData = [];
                    const sortedLabels = [];
                    const sortedTimestamps = [];
                    
                    // Create pairs of [timestamp, timeLabel, rate] for sorting
                    const pairs = timestamps.map((ts, index) => [ts, timeLabels[index], coinData[index]]);
                    
                    // Sort by timestamp
                    pairs.sort((a, b) => a[0] - b[0]);
                    
                    // Extract sorted data
                    pairs.forEach(pair => {
                        sortedTimestamps.push(pair[0]);
                        sortedLabels.push(pair[1]);
                        sortedData.push(pair[2]);
                    });
                    
                    // Start from the selected range start time, rounded to the nearest hour
                    const rangeStartTime = new Date(startTime);
                    rangeStartTime.setMinutes(0, 0, 0);
                    
                    // Get current time for comparison
                    const currentTime = new Date();
                    currentTime.setMinutes(0, 0, 0);
                    
                    // Find the latest timestamp in the data
                    let latestDataTime;
                    if (sortedTimestamps.length > 0) {
                        const latestTimestamp = Math.max(...sortedTimestamps);
                        console.log(`Latest timestamp in data: ${new Date(latestTimestamp).toLocaleString()}`);
                        
                        // Get the latest data point hour
                        latestDataTime = new Date(latestTimestamp);
                        latestDataTime.setMinutes(0, 0, 0);
                    } else {
                        // If no data, use range start time as fallback
                        latestDataTime = new Date(rangeStartTime);
                        console.log(`No data found, using range start time as latest data time: ${latestDataTime.toLocaleString()}`);
                    }
                    
                    // Always use current time as end time to show missing data between latest data point and now
                    const endTime = new Date(currentTime);
                    console.log(`Chart end time: ${endTime.toLocaleString()}`);
                    console.log(`Latest data time: ${latestDataTime.toLocaleString()}`);
                    
                    // Generate the complete time range including missing hours
                    const completeTimeLabels = [];
                    const completeData = [];
                    
                    // Create an array of all hours in the range
                    let hourCount = 0;
                    for (let time = new Date(rangeStartTime); time <= endTime; time.setHours(time.getHours() + 1)) {
                        hourCount++;
                        // Create a display time that's shifted back by 1 hour to show the start of the collection period
                        const displayTime = new Date(time);
                        displayTime.setHours(displayTime.getHours() - 1);
                        const timeLabel = displayTime.toLocaleString([], {
                            hour: '2-digit',
                            hour12: true,
                            day: '2-digit',
                            month: '2-digit'
                        });
                        completeTimeLabels.push(timeLabel);
                        
                        // Find if we have data for this hour
                        const matchingDataIndex = sortedTimestamps.findIndex(ts => {
                            const dataTime = new Date(ts);
                            return dataTime.getHours() === time.getHours() && 
                                   dataTime.getDate() === time.getDate() && 
                                   dataTime.getMonth() === time.getMonth() &&
                                   dataTime.getFullYear() === time.getFullYear();
                        });
                        
                        // If we have data for this hour, use it; otherwise, use null to create a gap
                        if (matchingDataIndex !== -1) {
                            completeData.push(sortedData[matchingDataIndex]);
                        } else {
                            // Only mark as null if we're within the range where we expect data
                            // This helps avoid false "missing data" indicators
                            if (coinData.length > 0) {
                                // For hours between the latest data point and current time, mark as null to show missing data
                                if (time > latestDataTime && time <= endTime) {
                                    completeData.push(null); // Missing data after latest data point
                                    console.log(`Marking missing data for time after latest data: ${time.toLocaleString()}`);
                                }
                                // For recent data (last 24 hours from the latest data point), mark missing data as null
                                else {
                                    const recentTimeThreshold = new Date(latestDataTime);
                                    recentTimeThreshold.setHours(recentTimeThreshold.getHours() - 24);
                                    
                                    if (time >= recentTimeThreshold && time <= latestDataTime) {
                                        completeData.push(null); // Recent missing data point
                                    } else if (time >= new Date(Math.min(...sortedTimestamps)) && 
                                        time <= latestDataTime) {
                                        completeData.push(null); // Truly missing data point within historical range
                                    } else {
                                        completeData.push(undefined); // Outside data range, don't show indicator
                                    }
                                }
                            } else {
                                completeData.push(undefined); // No data at all for this coin
                            }
                        }
                    }
                    
                    console.log(`Complete time range has ${completeTimeLabels.length} hours, with ${completeData.filter(d => d !== null && d !== undefined).length} data points and ${completeData.filter(d => d === null).length} missing points`);
                    
                    // Debug: Log the last few data points to check for missing data at the end
                    const lastFewHours = 5;
                    console.log(`Last ${lastFewHours} hours of data:`);
                    for (let i = Math.max(0, completeData.length - lastFewHours); i < completeData.length; i++) {
                        console.log(`Hour ${completeTimeLabels[i]}: ${completeData[i] === null ? 'MISSING' : completeData[i] === undefined ? 'UNDEFINED' : completeData[i].toFixed(2)}`);
                    }
                    
                    // Store chart data and options for reuse when switching chart types
                    chartData = {
                        labels: completeTimeLabels,
                        datasets: [{
                            label: 'Funding Rate (%)',
                            data: completeData,
                            borderColor: function(context) {
                                const index = context.dataIndex;
                                const value = context.dataset.data[index];
                                return value >= 0 ? 'rgba(0, 255, 0, 0.7)' : 'rgba(255, 0, 0, 0.7)';
                            },
                            backgroundColor: 'transparent', // No fill from Chart.js (we'll use our plugin)
                            borderWidth: 2,
                            pointRadius: 4,
                            pointHoverRadius: 6,
                            tension: 0.1,
                            spanGaps: false
                        }]
                    };
                    
                    chartOptions = {
                        responsive: true,
                        maintainAspectRatio: false,
                        animation: {
                            duration: 400 // Set a short animation duration for a subtle effect
                        },
                        plugins: {
                            tooltip: {
                                enabled: false, // Disable default tooltips since we're using our custom ones
                                callbacks: {
                                    label: function(context) {
                                        const value = context.raw;
                                        if (value === null) {
                                            return 'No data available';
                                        }
                                        return `Funding Rate: ${formatChartValue(value)}`;
                                    }
                                }
                            },
                            legend: {
                                display: false
                            }
                        },
                        scales: {
                            x: {
                                grid: {
                                    color: 'rgba(255, 255, 255, 0.1)'
                                },
                                ticks: {
                                    color: '#cccccc',
                                    maxRotation: 45,
                                    minRotation: 45,
                                    // Limit the number of x-axis labels for readability
                                    callback: function(val, index) {
                                        // For longer ranges, show fewer labels
                                        // Use the global selectedChartRange directly
                                        const labelInterval = selectedChartRange === '1d' ? 1 : 
                                                            selectedChartRange === '1w' ? 6 : 
                                                            selectedChartRange === '2w' ? 12 : 
                                                            selectedChartRange === '1m' ? 24 : 
                                                            selectedChartRange === '2m' ? 48 :
                                                            72; // For '3m', show every 72 hours
                                        return index % labelInterval === 0 ? this.getLabelForValue(val) : '';
                                    }
                                }
                            },
                            y: {
                                grid: {
                                    color: function(context) {
                                        if (context.tick.value === 0) {
                                            return 'rgba(255, 255, 255, 0.5)'; // Highlight zero line
                                        }
                                        return 'rgba(255, 255, 255, 0.1)';
                                    }
                                },
                                ticks: {
                                    color: '#cccccc',
                                    callback: function(value) {
                                        return formatChartValue(value);
                                    }
                                }
                            }
                        }
                    };
                    
                    // Create the chart with the current chart type
                    createChart();
                } else {
                    // CSV format not recognized
                    $('#chartLoading').hide();
                    $('.chart-container').hide(); // Hide the chart container
                    $('#coinInfoPopupContent').append('<p class="error-message">Could not parse funding data format.</p>');
                }
            },
            error: function(xhr, status, error) {
                console.error("Error loading CSV:", error);
                console.log("Status:", status);
                console.log("XHR:", xhr);
                
                // If CSV fetch fails, use the averages
                $('#chartLoading').hide();
                
                if (currentRate === null && oneDay === undefined && threeDay === undefined && fiveDay === undefined) {
                    $('.chart-container').hide(); // Hide the chart container
                    $('#coinInfoPopupContent').append('<p class="error-message">No funding data available for this coin.</p>');
                    return;
                }
                
                // Create a simple chart with the available averages
                const labels = [];
                const data = [];
                
                if (fiveDay !== undefined) {
                    labels.push('5-Day Avg');
                    data.push(fiveDay);
                }
                
                if (threeDay !== undefined) {
                    labels.push('3-Day Avg');
                    data.push(threeDay);
                }
                
                if (oneDay !== undefined) {
                    labels.push('1-Day Avg');
                    data.push(oneDay);
                }
                
                if (currentRate !== null) {
                    labels.push('Current');
                    data.push(currentRate);
                }
                
                // Store chart data and options for reuse when switching chart types
                chartData = {
                    labels: labels,
                    datasets: [{
                        label: 'Funding Rate (%)',
                        data: data,
                        backgroundColor: function(context) {
                            const value = context.raw;
                            return value >= 0 ? 'rgba(0, 255, 0, 0.7)' : 'rgba(255, 0, 0, 0.7)';
                        },
                        borderColor: function(context) {
                            const value = context.raw;
                            return value >= 0 ? 'rgba(0, 255, 0, 1.0)' : 'rgba(255, 0, 0, 1.0)';
                        },
                        borderWidth: 1
                    }]
                };
                
                chartOptions = {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: {
                        duration: 400 // Set a short animation duration for a subtle effect
                    },
                    plugins: {
                        tooltip: {
                            enabled: false, // Disable default tooltips since we're using our custom ones
                            callbacks: {
                                label: function(context) {
                                    return `Funding Rate: ${formatChartValue(context.raw)}`;
                                }
                            }
                        },
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        x: {
                            grid: {
                                color: 'rgba(255, 255, 255, 0.1)'
                            },
                            ticks: {
                                color: '#cccccc'
                            }
                        },
                        y: {
                            grid: {
                                color: function(context) {
                                    if (context.tick.value === 0) {
                                        return 'rgba(255, 255, 255, 0.5)'; // Highlight zero line
                                    }
                                    return 'rgba(255, 255, 255, 0.1)';
                                }
                            },
                            ticks: {
                                color: '#cccccc',
                                callback: function(value) {
                                    return formatChartValue(value);
                                }
                            }
                        }
                    }
                };
                
                // Create the chart with the current chart type
                createChart(); // Always use bar for averages
                
                // Update title to reflect we're showing averages
                $('#coinInfoPopupTitle').text(`${coin} Funding Rate Averages`);
                
                // Disable chart type selector for averages
                $('#chartTypeSelect').prop('disabled', true);
            }
        });
    }).fail(function(jqXHR, textStatus, errorThrown) {
        console.error("Error loading JSON:", errorThrown);
        console.log("Status:", textStatus);
        console.log("jqXHR:", jqXHR);
        
        // If JSON fetch fails, show error message
        $('#chartLoading').hide();
        $('.chart-container').hide(); // Hide the chart container
        $('#coinInfoPopupContent').append('<p class="error-message">Failed to load funding data.</p>');
    });
}

// Function to format chart value based on display mode
function formatChartValue(value, mode = displayMode) {
    if (value === null || value === undefined) {
        return 'No data';
    }
    
    if (mode === 'apr') {
        // Already in APR format
        return value.toFixed(2) + '%';
    } else {
        // Convert from APR to hourly
        const hourlyRate = value / (24 * 365);
        return hourlyRate.toFixed(6) + '%';
    }
}

// Function to create or update the chart with column type
function createChart() {
    if (!chartData || !chartOptions) return;
    
    const ctx = document.getElementById('fundingHistoryChart').getContext('2d');
    
    // Destroy existing chart if it exists
    if (window.fundingChart) {
        window.fundingChart.destroy();
    }
    
    // Create a deep copy of the chart data to avoid modifying the original
    const chartDataCopy = JSON.parse(JSON.stringify(chartData));
    
    // Create a deep copy of the chart options
    const chartOptionsCopy = JSON.parse(JSON.stringify(chartOptions));
    
    // Disable animations for all chart types to make them appear instantly
    chartOptionsCopy.animation = {
        duration: 400 // Set a short animation duration for a subtle effect
    };
    
        // For bar chart, use a single dataset with color function
        chartDataCopy.datasets[0].backgroundColor = function(context) {
            const value = context.raw;
            if (value === null || value === undefined) return 'rgba(0, 0, 0, 0)'; // Transparent for missing data
            return value >= 0 ? 'rgba(0, 255, 0, 0.7)' : 'rgba(255, 0, 0, 0.7)';
        };
        
        chartDataCopy.datasets[0].borderColor = function(context) {
            const value = context.raw;
            if (value === null || value === undefined) return 'rgba(0, 0, 0, 0)'; // Transparent for missing data
            return value >= 0 ? 'rgba(0, 255, 0, 1.0)' : 'rgba(255, 0, 0, 1.0)';
        };
    
    // Update tooltip and axis formatting based on display mode
    if (chartOptionsCopy.plugins && chartOptionsCopy.plugins.tooltip) {
        chartOptionsCopy.plugins.tooltip.enabled = false; // Disable default tooltips since we're using our custom ones
        chartOptionsCopy.plugins.tooltip.callbacks.label = function(context) {
            const value = context.raw;
            if (value === null) {
                return 'No data available';
            }
            return `Funding Rate: ${formatChartValue(value)}`;
        };
    }
    
    if (chartOptionsCopy.scales && chartOptionsCopy.scales.y && chartOptionsCopy.scales.y.ticks) {
        chartOptionsCopy.scales.y.ticks.callback = function(value) {
            return formatChartValue(value);
        };
    }
    
    // Update chart options for performance with large datasets
    const range = selectedChartRange; // Use the global variable
    if (range === '3m' || range === '5m' || range === 'all') {
        // For larger datasets, add decimation to improve performance
        if (!chartOptionsCopy.plugins) chartOptionsCopy.plugins = {};
        chartOptionsCopy.plugins.decimation = {
            enabled: true,
            algorithm: 'min-max'
        };
        
        // Reduce animation duration for larger datasets
        chartOptionsCopy.animation.duration = 200;
    }
    
    // Define the missing data indicator plugin for bar charts
    const missingDataPlugin = {
        id: 'missingData',
        beforeDraw: function(chart) {
            const ctx = chart.ctx;
            const dataset = chart.data.datasets[0];
            const yAxis = chart.scales.y;
            const xAxis = chart.scales.x;
            
            // Find the first and last non-null, non-undefined data points
            let firstDataIndex = -1;
            let lastDataIndex = -1;
            
            for (let i = 0; i < dataset.data.length; i++) {
                if (dataset.data[i] !== null && dataset.data[i] !== undefined) {
                    if (firstDataIndex === -1) firstDataIndex = i;
                    lastDataIndex = i;
                }
            }
            
            // Draw yellow indicators for missing data
            for (let i = 0; i < dataset.data.length; i++) {
                // Only draw for null values (missing data), not undefined (outside range)
                // Also skip the very first position to avoid edge artifacts
                if (dataset.data[i] === null && i > 0 && i < dataset.data.length) {
                    // Additional check: only draw if between first and last actual data points
                    // or if after the last data point (for recent missing data)
                    if ((i > firstDataIndex && i < lastDataIndex) || 
                        (i > lastDataIndex)) { // Show missing data after the last data point
                        
                        const x = xAxis.getPixelForValue(i);
                        
                        // Draw a vertical yellow line
                        ctx.save();
                        ctx.beginPath();
                        ctx.moveTo(x, yAxis.top);
                        ctx.lineTo(x, yAxis.bottom);
                        ctx.lineWidth = 1;
                        ctx.strokeStyle = 'rgba(255, 255, 0, 0.3)'; // Semi-transparent yellow
                        ctx.stroke();
                        
                        // Draw a small yellow indicator at the zero line
                        const zeroY = yAxis.getPixelForValue(0);
                        ctx.beginPath();
                        ctx.arc(x, zeroY, 3, 0, Math.PI * 2);
                        ctx.fillStyle = 'rgba(255, 255, 0, 0.5)';
                        ctx.fill();
                        
                        ctx.restore();
                    }
                }
            }
        }
    };
    
    // Define the missing data tooltip plugin
    const missingDataTooltipPlugin = {
        id: 'missingVolumeDataTooltip',
        afterDraw: function(chart) {
            const ctx = chart.ctx;
            const dataset = chart.data.datasets[0];
            const yAxis = chart.scales.y;
            const xAxis = chart.scales.x;
            
            // Find the first and last non-null, non-undefined data points
            let firstDataIndex = -1;
            let lastDataIndex = -1;
            
            for (let i = 0; i < dataset.data.length; i++) {
                if (dataset.data[i] !== null && dataset.data[i] !== undefined) {
                    if (firstDataIndex === -1) firstDataIndex = i;
                    lastDataIndex = i;
                }
            }
            
            // Check for hover over missing data points
            for (let i = 0; i < dataset.data.length; i++) {
                if (dataset.data[i] === null && i > 0 && i < dataset.data.length) {
                    // Additional check: only consider if between first and last actual data points
                    // or if after the last data point (for recent missing data)
                    if ((i > firstDataIndex && i < lastDataIndex) || 
                        (i > lastDataIndex)) { // Show missing data after the last data point
                        
                        const x = xAxis.getPixelForValue(i);
                        
                        // Check if mouse is near this x position (proximity detection)
                        const proximityThreshold = 5; // pixels
                        if (Math.abs(mouseX - x) <= proximityThreshold) {
                            // Mouse is hovering near a missing data point, show tooltip
                            ctx.save();
                            
                            // Get the time label for this data point
                            const timeLabel = chart.data.labels[i];
                            
                            // Draw tooltip background
                            const tooltipText = `Missing data at ${timeLabel}`;
                            const tooltipWidth = ctx.measureText(tooltipText).width + 16;
                            const tooltipHeight = 24;
                            
                            // Calculate tooltip position, adjusting for edge of the chart
                            let tooltipX = x - tooltipWidth / 2;
                            
                            // Determine if tooltip should be below or above the mouse Y position
                            let tooltipY;
                            let tooltipPosition = 'above'; // Default position
                            const spaceAbove = mouseY - chart.chartArea.top;
                            const minSpaceNeeded = tooltipHeight + 15; // Height + margin
                            
                            if (spaceAbove < minSpaceNeeded) {
                                // Not enough space above, place tooltip below the point
                                tooltipY = mouseY + 15;
                                tooltipPosition = 'below';
                            } else {
                                // Enough space above, place tooltip above the point
                                tooltipY = mouseY - tooltipHeight - 10;
                            }
                            
                            // Adjust X position if tooltip would be off the edge of the chart
                            const chartWidth = chart.chartArea.right;
                            if (tooltipX + tooltipWidth > chartWidth) {
                                tooltipX = chartWidth - tooltipWidth - 5; // 5px padding from edge
                            }
                            if (tooltipX < chart.chartArea.left) {
                                tooltipX = chart.chartArea.left + 5; // 5px padding from edge
                            }
                            
                            // Further adjust Y position if needed
                            if (tooltipPosition === 'above' && tooltipY < chart.chartArea.top + 5) {
                                tooltipY = chart.chartArea.top + 5; // Keep minimum distance from top
                            } else if (tooltipPosition === 'below' && tooltipY + tooltipHeight > chart.chartArea.bottom - 5) {
                                tooltipY = chart.chartArea.bottom - tooltipHeight - 5; // Keep minimum distance from bottom
                            }
                            
                            // Draw tooltip background
                            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
                            ctx.beginPath();
                            // Use a compatible approach for rounded rectangle
                            const radius = 4;
                            ctx.moveTo(tooltipX + radius, tooltipY);
                            ctx.lineTo(tooltipX + tooltipWidth - radius, tooltipY);
                            ctx.quadraticCurveTo(tooltipX + tooltipWidth, tooltipY, tooltipX + tooltipWidth, tooltipY + radius);
                            ctx.lineTo(tooltipX + tooltipWidth, tooltipY + tooltipHeight - radius);
                            ctx.quadraticCurveTo(tooltipX + tooltipWidth, tooltipY + tooltipHeight, tooltipX + tooltipWidth - radius, tooltipY + tooltipHeight);
                            ctx.lineTo(tooltipX + radius, tooltipY + tooltipHeight);
                            ctx.quadraticCurveTo(tooltipX, tooltipY + tooltipHeight, tooltipX, tooltipY + tooltipHeight - radius);
                            ctx.lineTo(tooltipX, tooltipY + radius);
                            ctx.quadraticCurveTo(tooltipX, tooltipY, tooltipX + radius, tooltipY);
                            ctx.closePath();
                            ctx.fill();
                            
                            // Draw tooltip text
                            ctx.fillStyle = '#ffffff';
                            ctx.font = '12px Arial';
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(tooltipText, tooltipX + tooltipWidth / 2, tooltipY + tooltipHeight / 2);
                            
                            // Draw a more prominent yellow indicator
                            ctx.beginPath();
                            ctx.arc(x, mouseY, 4, 0, Math.PI * 2);
                            ctx.fillStyle = 'rgba(255, 255, 0, 0.8)';
                            ctx.fill();
                            ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
                            ctx.lineWidth = 1;
                            ctx.stroke();
                            
                            ctx.restore();
                            break; // Only show one tooltip at a time
                        }
                    }
                }
            }
        }
    };
    
    // Define plugin for horizontal hover detection
    const horizontalHoverPlugin = {
        id: 'horizontalHover',
        afterDraw: function(chart) {
            const ctx = chart.ctx;
            const dataset = chart.data.datasets[0];
            const yAxis = chart.scales.y;
            const xAxis = chart.scales.x;
            
            // If mouse is not over any chart, don't draw anything
            if (!isMouseOverChart) {
                return;
            }
            
            // If another chart is active and we're syncing, use the global hover index
            // Otherwise, find the closest point in this chart
            let closestIndex = -1;
            
            if (activeChartId && activeChartId !== 'fundingChart') {
                // Use the global hover index if it's valid for this chart
                if (hoverIndex >= 0 && hoverIndex < dataset.data.length) {
                    closestIndex = hoverIndex;
                }
            } else {
                let closestDistance = Number.MAX_VALUE;
                
                for (let i = 0; i < dataset.data.length; i++) {
                    // Skip null or undefined data points
                    if (dataset.data[i] === null || dataset.data[i] === undefined) continue;
                    
                    const x = xAxis.getPixelForValue(i);
                    const distance = Math.abs(mouseX - x);
                    
                    if (distance < closestDistance) {
                        closestDistance = distance;
                        closestIndex = i;
                    }
                }
                
                // Update global hover index if this chart is active
                if (activeChartId === 'fundingChart' || !activeChartId) {
                    hoverIndex = closestIndex;
                }
            }
            
            // If we found a closest data point and it's valid
            const proximityThreshold = Math.max(30, chart.chartArea.width / dataset.data.length); // Dynamic threshold
            if (closestIndex !== -1 && (activeChartId === 'fundingChart' || !activeChartId || activeChartId === 'volumeChart' || activeChartId === 'priceChart')) {
                const x = xAxis.getPixelForValue(closestIndex);
                const y = yAxis.getPixelForValue(dataset.data[closestIndex]);
                
                // Draw vertical line only
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(x, chart.chartArea.top);
                ctx.lineTo(x, chart.chartArea.bottom);
                ctx.lineWidth = 1;
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                ctx.stroke();
                
                // Draw point at intersection with the value
                ctx.beginPath();
                ctx.arc(x, y, 5, 0, Math.PI * 2);
                const value = dataset.data[closestIndex];
                ctx.fillStyle = value >= 0 ? 'rgba(0, 255, 0, 0.7)' : 'rgba(255, 0, 0, 0.7)';
                ctx.fill();
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 1;
                ctx.stroke();
                
                // Draw tooltip
                const timeLabel = chart.data.labels[closestIndex];
                const valueText = formatChartValue(value);
                const tooltipText = `${timeLabel}: ${valueText}`;
                const tooltipWidth = ctx.measureText(tooltipText).width + 16;
                const tooltipHeight = 24;
                
                // Calculate tooltip position, adjusting for edge of the chart
                let tooltipX = x - tooltipWidth / 2;
                
                // Determine if tooltip should be below or above the point
                let tooltipY;
                let tooltipPosition = 'above'; // Default position
                const spaceAbove = y - chart.chartArea.top;
                const minSpaceNeeded = tooltipHeight + 15; // Height + margin
                
                if (spaceAbove < minSpaceNeeded || y < tooltipHeight + 15) {
                    // Not enough space above, place tooltip below the point
                    tooltipY = y + 15;
                    tooltipPosition = 'below';
                } else {
                    // Enough space above, place tooltip above the point
                    tooltipY = y - tooltipHeight - 10;
                }
                
                // Adjust X position if tooltip would be off the edge of the chart
                const chartWidth = chart.chartArea.right;
                if (tooltipX + tooltipWidth > chartWidth) {
                    tooltipX = chartWidth - tooltipWidth - 5; // 5px padding from edge
                }
                if (tooltipX < chart.chartArea.left) {
                    tooltipX = chart.chartArea.left + 5; // 5px padding from edge
                }
                
                // Further adjust Y position if needed
                if (tooltipPosition === 'above' && tooltipY < chart.chartArea.top + 5) {
                    tooltipY = chart.chartArea.top + 5; // Keep minimum distance from top
                } else if (tooltipPosition === 'below' && tooltipY + tooltipHeight > chart.chartArea.bottom - 5) {
                    tooltipY = chart.chartArea.bottom - tooltipHeight - 5; // Keep minimum distance from bottom
                }
                
                // Draw tooltip background
                ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
                ctx.beginPath();
                // Use a compatible approach for rounded rectangle
                const radius = 4;
                ctx.moveTo(tooltipX + radius, tooltipY);
                ctx.lineTo(tooltipX + tooltipWidth - radius, tooltipY);
                ctx.quadraticCurveTo(tooltipX + tooltipWidth, tooltipY, tooltipX + tooltipWidth, tooltipY + radius);
                ctx.lineTo(tooltipX + tooltipWidth, tooltipY + tooltipHeight - radius);
                ctx.quadraticCurveTo(tooltipX + tooltipWidth, tooltipY + tooltipHeight, tooltipX + tooltipWidth - radius, tooltipY + tooltipHeight);
                ctx.lineTo(tooltipX + radius, tooltipY + tooltipHeight);
                ctx.quadraticCurveTo(tooltipX, tooltipY + tooltipHeight, tooltipX, tooltipY + tooltipHeight - radius);
                ctx.lineTo(tooltipX, tooltipY + radius);
                ctx.quadraticCurveTo(tooltipX, tooltipY, tooltipX + radius, tooltipY);
                ctx.closePath();
                ctx.fill();
                
                // Draw tooltip text
                ctx.fillStyle = '#ffffff';
                ctx.font = '12px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(tooltipText, tooltipX + tooltipWidth / 2, tooltipY + tooltipHeight / 2);
                
                ctx.restore();
                
                // Disable Chart.js tooltip for this point
                chart.tooltip.setActiveElements([], { datasetIndex: 0, index: closestIndex });
            }
        }
    };
    
    // Create the chart with the specified type and plugins
    window.fundingChart = new Chart(ctx, {
        type: 'bar',
        data: chartDataCopy,
        options: chartOptionsCopy,
        plugins: [missingDataPlugin, missingDataTooltipPlugin, horizontalHoverPlugin]
    });
    
    // Add mouse event listeners to the funding chart canvas
    const fundingChartCanvas = document.getElementById('fundingHistoryChart');
    
    fundingChartCanvas.addEventListener('mousemove', function(e) {
        const rect = this.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;
        
        activeChartId = 'fundingChart';
        isMouseOverChart = true;
        
        // Request animation frame to redraw all charts
        if (window.fundingChart) {
            window.fundingChart.render();
        }
        if (window.volumeChart) {
            window.volumeChart.render();
        }
        if (window.priceChart) {
            window.priceChart.render();
        }
    });
    
    fundingChartCanvas.addEventListener('mouseleave', function() {
        isMouseOverChart = false;
        activeChartId = null;
        hoverIndex = -1;
        
        // Redraw all charts to clear hover effects
        if (window.fundingChart) {
            window.fundingChart.render();
        }
        if (window.volumeChart) {
            window.volumeChart.render();
        }
        if (window.priceChart) {
            window.priceChart.render();
        }
    });
    
    fundingChartCanvas.addEventListener('mouseenter', function() {
        isMouseOverChart = true;
        activeChartId = 'fundingChart';
    });
}

// Function to load volume data based on the selected range
function loadVolumeData(coin, range) {
    // Show loading indicator
    $('#volumeChartLoading').show();
    
    // Calculate the time range based on the selected range
    const now = Date.now();
    let startTime;
    
    switch (range) {
        case '1d':
            startTime = now - (24 * 60 * 60 * 1000); // 1 day in milliseconds
            break;
        case '1w':
            startTime = now - (7 * 24 * 60 * 60 * 1000); // 1 week in milliseconds
            break;
        case '2w':
            startTime = now - (14 * 24 * 60 * 60 * 1000); // 2 weeks in milliseconds
            break;
        case '1m':
            startTime = now - (30 * 24 * 60 * 60 * 1000); // 1 month (approx) in milliseconds
            break;
        case '2m':
            startTime = now - (60 * 24 * 60 * 60 * 1000); // 2 months (approx) in milliseconds
            break;
        case '3m':
            startTime = now - (90 * 24 * 60 * 60 * 1000); // 3 months (approx) in milliseconds
            break;
        default:
            startTime = now - (24 * 60 * 60 * 1000); // Default to 1 day
    }
    
    // Fetch the CSV file to get volume data
    $.ajax({
        url: '../ohlcv_data_main.csv', // Access the volume data file with the correct name
        dataType: 'text',
        success: function(csvData) {
            console.log("Volume CSV data loaded successfully");
            
            // Parse CSV data
            const rows = csvData.split('\n');
            console.log(`Volume CSV has ${rows.length} rows`);
            
            // Try to detect CSV format
            const firstRow = rows[0].split(',');
            console.log(`Volume CSV columns: ${firstRow.join(', ')}`);
            
            // Find column indices - assuming OHLCV format with columns: timestamp, open, high, low, close, volume
            const timeIndex = firstRow.indexOf('time');
            const coinIndex = firstRow.indexOf('coin');
            const volumeIndex = firstRow.indexOf('volume_usd');
            
            if (timeIndex >= 0 && coinIndex >= 0 && volumeIndex >= 0) {
                // Filter data for the selected coin and time range
                const volumeData = [];
                const timeLabels = [];
                const timestamps = [];
                
                // Process each row
                for (let i = 1; i < rows.length; i++) {
                    if (!rows[i].trim()) continue; // Skip empty rows
                    
                    const columns = rows[i].split(',');
                    if (columns.length <= Math.max(coinIndex, volumeIndex, timeIndex)) continue;
                    
                    const rowCoin = columns[coinIndex];
                    const volume = parseFloat(columns[volumeIndex]);
                    const timestamp = parseInt(columns[timeIndex]);
                    
                    // Important: Volume timestamp shows when hour STARTED
                    // Funding timestamp shows when hour ENDED
                    // Add one hour to volume timestamp to align with funding data
                    const adjustedTimestamp = timestamp + (60 * 60 * 1000);
                    
                    if (rowCoin === coin && adjustedTimestamp >= startTime && !isNaN(volume) && !isNaN(timestamp)) {
                        // Format time as hour (using adjusted timestamp for display)
                        const date = new Date(adjustedTimestamp);
                        // Shift time back by 1 hour to show the start of the collection period
                        date.setHours(date.getHours() - 1);
                        const timeLabel = date.toLocaleString([], {
                            hour: '2-digit',
                            hour12: true,
                            day: '2-digit',
                            month: '2-digit'
                        });
                        
                        volumeData.push(volume);
                        timeLabels.push(timeLabel);
                        timestamps.push(adjustedTimestamp);
                    }
                }
                
                // Hide loading indicator
                $('#volumeChartLoading').hide();
                
                if (volumeData.length === 0) {
                    // No data found for this coin in the selected range
                    $('#volumeChartContainer .chart-container').hide(); // Hide the chart container
                    $('#volumeChartContainer').append(`<p class="error-message">No volume data available for ${coin} in the selected range (${range}).</p>`);
                    return;
                } else {
                    // Remove any previous error messages
                    $('#volumeChartContainer .error-message').remove();
                    $('#volumeChartContainer .chart-container').show(); // Make sure chart is visible
                }
                
                console.log(`Found ${volumeData.length} volume data points for ${coin} in range ${range}`);
                
                // Sort data by timestamp (oldest first)
                const sortedData = [];
                const sortedLabels = [];
                const sortedTimestamps = [];
                
                // Create pairs of [timestamp, timeLabel, volume] for sorting
                const pairs = timestamps.map((ts, index) => [ts, timeLabels[index], volumeData[index]]);
                
                // Sort by timestamp
                pairs.sort((a, b) => a[0] - b[0]);
                
                // Extract sorted data
                pairs.forEach(pair => {
                    sortedTimestamps.push(pair[0]);
                    sortedLabels.push(pair[1]);
                    sortedData.push(pair[2]);
                });
                
                // Start from the selected range start time, rounded to the nearest hour
                const rangeStartTime = new Date(startTime);
                rangeStartTime.setMinutes(0, 0, 0);
                
                // Get current time for comparison
                const currentTime = new Date();
                currentTime.setMinutes(0, 0, 0);
                
                // Find the latest timestamp in the data
                let latestDataTime;
                if (sortedTimestamps.length > 0) {
                    const latestTimestamp = Math.max(...sortedTimestamps);
                    console.log(`Latest volume timestamp in data: ${new Date(latestTimestamp).toLocaleString()}`);
                    
                    // Get the latest data point hour
                    latestDataTime = new Date(latestTimestamp);
                    latestDataTime.setMinutes(0, 0, 0);
                } else {
                    // If no data, use range start time as fallback
                    latestDataTime = new Date(rangeStartTime);
                    console.log(`No volume data found, using range start time as latest data time: ${latestDataTime.toLocaleString()}`);
                }
                
                // Always use current time as end time to show missing data between latest data point and now
                const endTime = new Date(currentTime);
                console.log(`Volume chart end time: ${endTime.toLocaleString()}`);
                console.log(`Latest volume data time: ${latestDataTime.toLocaleString()}`);
                
                // Generate the complete time range including missing hours
                const completeTimeLabels = [];
                const completeData = [];
                
                // Create an array of all hours in the range
                let hourCount = 0;
                for (let time = new Date(rangeStartTime); time <= endTime; time.setHours(time.getHours() + 1)) {
                    hourCount++;
                    // Create a display time that's shifted back by 1 hour to show the start of the collection period
                    const displayTime = new Date(time);
                    displayTime.setHours(displayTime.getHours() - 1);
                    const timeLabel = displayTime.toLocaleString([], {
                        hour: '2-digit',
                        hour12: true,
                        day: '2-digit',
                        month: '2-digit'
                    });
                    completeTimeLabels.push(timeLabel);
                    
                    // Find if we have data for this hour
                    const matchingDataIndex = sortedTimestamps.findIndex(ts => {
                        const dataTime = new Date(ts);
                        return dataTime.getHours() === time.getHours() && 
                               dataTime.getDate() === time.getDate() && 
                               dataTime.getMonth() === time.getMonth() &&
                               dataTime.getFullYear() === time.getFullYear();
                    });
                    
                    // If we have data for this hour, use it; otherwise, use null to create a gap
                    if (matchingDataIndex !== -1) {
                        completeData.push(sortedData[matchingDataIndex]);
                    } else {
                        // Only mark as null if we're within the range where we expect data
                        // This helps avoid false "missing data" indicators
                        if (volumeData.length > 0) {
                            // For hours between the latest data point and current time, mark as null to show missing data
                            if (time > latestDataTime && time <= endTime) {
                                completeData.push(null); // Missing data after latest data point
                            }
                            // For recent data (last 24 hours from the latest data point), mark missing data as null
                            else {
                                const recentTimeThreshold = new Date(latestDataTime);
                                recentTimeThreshold.setHours(recentTimeThreshold.getHours() - 24);
                                
                                if (time >= recentTimeThreshold && time <= latestDataTime) {
                                    completeData.push(null); // Recent missing data point
                                } else if (time >= new Date(Math.min(...sortedTimestamps)) && 
                                    time <= latestDataTime) {
                                    completeData.push(null); // Truly missing data point within historical range
                                } else {
                                    completeData.push(undefined); // Outside data range, don't show indicator
                                }
                            }
                        } else {
                            completeData.push(undefined); // No data at all for this coin
                        }
                    }
                }
                
                console.log(`Complete volume time range has ${completeTimeLabels.length} hours, with ${completeData.filter(d => d !== null && d !== undefined).length} data points and ${completeData.filter(d => d === null).length} missing points`);
                
                // Create volume chart
                createVolumeChart(completeTimeLabels, completeData);
                
            } else {
                // CSV format not recognized
                $('#volumeChartLoading').hide();
                $('#volumeChartContainer .chart-container').hide(); // Hide the chart container
                $('#volumeChartContainer').append('<p class="error-message">Could not parse volume data format.</p>');
            }
        },
        error: function(xhr, status, error) {
            console.error("Error loading volume CSV:", error);
            console.log("Status:", status);
            console.log("XHR:", xhr);
            
            // Show error message
            $('#volumeChartLoading').hide();
            $('#volumeChartContainer .chart-container').hide(); // Hide the chart container
            $('#volumeChartContainer').append('<p class="error-message">Failed to load volume data.</p>');
        }
    });
}

// Function to create the volume chart
function createVolumeChart(labels, data) {
    const ctx = document.getElementById('volumeHistoryChart').getContext('2d');
    
    // Destroy existing chart if it exists
    if (window.volumeChart) {
        window.volumeChart.destroy();
    }
    
    // Format volume numbers for display
    function formatVolumeValue(value) {
        if (value === null || value === undefined) {
            return 'No data';
        }
        
        // Format large numbers with K, M, B suffixes
        if (value >= 1000000000) {
            return (value / 1000000000).toFixed(2) + 'B';
        } else if (value >= 1000000) {
            return (value / 1000000).toFixed(2) + 'M';
        } else if (value >= 1000) {
            return (value / 1000).toFixed(2) + 'K';
        } else {
            return value.toFixed(2);
        }
    }
    
    // Define the missing data indicator plugin for bar charts
    const missingDataPlugin = {
        id: 'missingVolumeData',
        beforeDraw: function(chart) {
            const ctx = chart.ctx;
            const dataset = chart.data.datasets[0];
            const yAxis = chart.scales.y;
            const xAxis = chart.scales.x;
            
            // Find the first and last non-null, non-undefined data points
            let firstDataIndex = -1;
            let lastDataIndex = -1;
            
            for (let i = 0; i < dataset.data.length; i++) {
                if (dataset.data[i] !== null && dataset.data[i] !== undefined) {
                    if (firstDataIndex === -1) firstDataIndex = i;
                    lastDataIndex = i;
                }
            }
            
            // Draw yellow indicators for missing data
            for (let i = 0; i < dataset.data.length; i++) {
                // Only draw for null values (missing data), not undefined (outside range)
                // Also skip the very first position to avoid edge artifacts
                if (dataset.data[i] === null && i > 0 && i < dataset.data.length) {
                    // Additional check: only draw if between first and last actual data points
                    // or if after the last data point (for recent missing data)
                    if ((i > firstDataIndex && i < lastDataIndex) || 
                        (i > lastDataIndex)) { // Show missing data after the last data point
                        
                        const x = xAxis.getPixelForValue(i);
                        
                        // Draw a vertical yellow line
                        ctx.save();
                        ctx.beginPath();
                        ctx.moveTo(x, yAxis.top);
                        ctx.lineTo(x, yAxis.bottom);
                        ctx.lineWidth = 1;
                        ctx.strokeStyle = 'rgba(255, 255, 0, 0.3)'; // Semi-transparent yellow
                        ctx.stroke();
                        
                        // Draw a small yellow indicator at the zero line
                        const zeroY = yAxis.getPixelForValue(0);
                        ctx.beginPath();
                        ctx.arc(x, zeroY, 3, 0, Math.PI * 2);
                        ctx.fillStyle = 'rgba(255, 255, 0, 0.5)';
                        ctx.fill();
                        
                        ctx.restore();
                    }
                }
            }
        }
    };
    
    // Define the missing data tooltip plugin
    const missingDataTooltipPlugin = {
        id: 'missingVolumeDataTooltip',
        afterDraw: function(chart) {
            const ctx = chart.ctx;
            const dataset = chart.data.datasets[0];
            const yAxis = chart.scales.y;
            const xAxis = chart.scales.x;
            
            // Find the first and last non-null, non-undefined data points
            let firstDataIndex = -1;
            let lastDataIndex = -1;
            
            for (let i = 0; i < dataset.data.length; i++) {
                if (dataset.data[i] !== null && dataset.data[i] !== undefined) {
                    if (firstDataIndex === -1) firstDataIndex = i;
                    lastDataIndex = i;
                }
            }
            
            // Check for hover over missing data points
            for (let i = 0; i < dataset.data.length; i++) {
                if (dataset.data[i] === null && i > 0 && i < dataset.data.length) {
                    // Additional check: only consider if between first and last actual data points
                    // or if after the last data point (for recent missing data)
                    if ((i > firstDataIndex && i < lastDataIndex) || 
                        (i > lastDataIndex)) { // Show missing data after the last data point
                        
                        const x = xAxis.getPixelForValue(i);
                        
                        // Check if mouse is near this x position (proximity detection)
                        const proximityThreshold = 5; // pixels
                        if (Math.abs(mouseX - x) <= proximityThreshold) {
                            // Mouse is hovering near a missing data point, show tooltip
                            ctx.save();
                            
                            // Get the time label for this data point
                            const timeLabel = chart.data.labels[i];
                            
                            // Draw tooltip background
                            const tooltipText = `Missing data at ${timeLabel}`;
                            const tooltipWidth = ctx.measureText(tooltipText).width + 16;
                            const tooltipHeight = 24;
                            
                            // Calculate tooltip position, adjusting for edge of the chart
                            let tooltipX = x - tooltipWidth / 2;
                            
                            // Determine if tooltip should be below or above the mouse Y position
                            let tooltipY;
                            let tooltipPosition = 'above'; // Default position
                            const spaceAbove = mouseY - chart.chartArea.top;
                            const minSpaceNeeded = tooltipHeight + 15; // Height + margin
                            
                            if (spaceAbove < minSpaceNeeded) {
                                // Not enough space above, place tooltip below the point
                                tooltipY = mouseY + 15;
                                tooltipPosition = 'below';
                            } else {
                                // Enough space above, place tooltip above the point
                                tooltipY = mouseY - tooltipHeight - 10;
                            }
                            
                            // Adjust X position if tooltip would be off the edge of the chart
                            const chartWidth = chart.chartArea.right;
                            if (tooltipX + tooltipWidth > chartWidth) {
                                tooltipX = chartWidth - tooltipWidth - 5; // 5px padding from edge
                            }
                            if (tooltipX < chart.chartArea.left) {
                                tooltipX = chart.chartArea.left + 5; // 5px padding from edge
                            }
                            
                            // Further adjust Y position if needed
                            if (tooltipPosition === 'above' && tooltipY < chart.chartArea.top + 5) {
                                tooltipY = chart.chartArea.top + 5; // Keep minimum distance from top
                            } else if (tooltipPosition === 'below' && tooltipY + tooltipHeight > chart.chartArea.bottom - 5) {
                                tooltipY = chart.chartArea.bottom - tooltipHeight - 5; // Keep minimum distance from bottom
                            }
                            
                            // Draw tooltip background
                            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
                            ctx.beginPath();
                            // Use a compatible approach for rounded rectangle
                            const radius = 4;
                            ctx.moveTo(tooltipX + radius, tooltipY);
                            ctx.lineTo(tooltipX + tooltipWidth - radius, tooltipY);
                            ctx.quadraticCurveTo(tooltipX + tooltipWidth, tooltipY, tooltipX + tooltipWidth, tooltipY + radius);
                            ctx.lineTo(tooltipX + tooltipWidth, tooltipY + tooltipHeight - radius);
                            ctx.quadraticCurveTo(tooltipX + tooltipWidth, tooltipY + tooltipHeight, tooltipX + tooltipWidth - radius, tooltipY + tooltipHeight);
                            ctx.lineTo(tooltipX + radius, tooltipY + tooltipHeight);
                            ctx.quadraticCurveTo(tooltipX, tooltipY + tooltipHeight, tooltipX, tooltipY + tooltipHeight - radius);
                            ctx.lineTo(tooltipX, tooltipY + radius);
                            ctx.quadraticCurveTo(tooltipX, tooltipY, tooltipX + radius, tooltipY);
                            ctx.closePath();
                            ctx.fill();
                            
                            // Draw tooltip text
                            ctx.fillStyle = '#ffffff';
                            ctx.font = '12px Arial';
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(tooltipText, tooltipX + tooltipWidth / 2, tooltipY + tooltipHeight / 2);
                            
                            // Draw a more prominent yellow indicator
                            ctx.beginPath();
                            ctx.arc(x, mouseY, 4, 0, Math.PI * 2);
                            ctx.fillStyle = 'rgba(255, 255, 0, 0.8)';
                            ctx.fill();
                            ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
                            ctx.lineWidth = 1;
                            ctx.stroke();
                            
                            ctx.restore();
                            break; // Only show one tooltip at a time
                        }
                    }
                }
            }
        }
    };
    
    // Define plugin for horizontal hover detection on the volume chart
    const volumeHorizontalHoverPlugin = {
        id: 'volumeHorizontalHover',
        afterDraw: function(chart) {
            const ctx = chart.ctx;
            const dataset = chart.data.datasets[0];
            const yAxis = chart.scales.y;
            const xAxis = chart.scales.x;
            
            // If mouse is not over any chart, don't draw anything
            if (!isMouseOverChart) {
                return;
            }
            
            // If another chart is active and we're syncing, use the global hover index
            // Otherwise, find the closest point in this chart
            let closestIndex = -1;
            
            if (activeChartId && activeChartId !== 'volumeChart') {
                // Use the global hover index if it's valid for this chart
                if (hoverIndex >= 0 && hoverIndex < dataset.data.length) {
                    closestIndex = hoverIndex;
                }
            } else {
                let closestDistance = Number.MAX_VALUE;
                
                for (let i = 0; i < dataset.data.length; i++) {
                    // Skip null or undefined data points
                    if (dataset.data[i] === null || dataset.data[i] === undefined) continue;
                    
                    const x = xAxis.getPixelForValue(i);
                    const distance = Math.abs(mouseX - x);
                    
                    if (distance < closestDistance) {
                        closestDistance = distance;
                        closestIndex = i;
                    }
                }
                
                // Update global hover index if this chart is active
                if (activeChartId === 'volumeChart' || !activeChartId) {
                    hoverIndex = closestIndex;
                }
            }
            
            // If we found a closest data point and it's valid
            const proximityThreshold = Math.max(30, chart.chartArea.width / dataset.data.length); // Dynamic threshold
            if (closestIndex !== -1 && (activeChartId === 'volumeChart' || !activeChartId || activeChartId === 'fundingChart' || activeChartId === 'priceChart')) {
                const x = xAxis.getPixelForValue(closestIndex);
                const y = yAxis.getPixelForValue(dataset.data[closestIndex]);
                
                // Draw vertical line only
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(x, chart.chartArea.top);
                ctx.lineTo(x, chart.chartArea.bottom);
                ctx.lineWidth = 1;
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                ctx.stroke();
                
                // Draw point at intersection with the value
                ctx.beginPath();
                ctx.arc(x, y, 5, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(64, 159, 255, 0.7)'; // Blue for volume
                ctx.fill();
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 1;
                ctx.stroke();
                
                // Draw tooltip
                const timeLabel = chart.data.labels[closestIndex];
                const value = dataset.data[closestIndex];
                const valueText = formatVolumeValue(value);
                const tooltipText = `${timeLabel}: ${valueText}`;
                const tooltipWidth = ctx.measureText(tooltipText).width + 16;
                const tooltipHeight = 24;
                
                // Calculate tooltip position, adjusting for edge of the chart
                let tooltipX = x - tooltipWidth / 2;
                
                // Determine if tooltip should be below or above the point
                let tooltipY;
                let tooltipPosition = 'above'; // Default position
                const spaceAbove = y - chart.chartArea.top;
                const minSpaceNeeded = tooltipHeight + 15; // Height + margin
                
                if (spaceAbove < minSpaceNeeded || y < tooltipHeight + 15) {
                    // Not enough space above, place tooltip below the point
                    tooltipY = y + 15;
                    tooltipPosition = 'below';
                } else {
                    // Enough space above, place tooltip above the point
                    tooltipY = y - tooltipHeight - 10;
                }
                
                // Adjust X position if tooltip would be off the edge of the chart
                const chartWidth = chart.chartArea.right;
                if (tooltipX + tooltipWidth > chartWidth) {
                    tooltipX = chartWidth - tooltipWidth - 5; // 5px padding from edge
                }
                if (tooltipX < chart.chartArea.left) {
                    tooltipX = chart.chartArea.left + 5; // 5px padding from edge
                }
                
                // Further adjust Y position if needed
                if (tooltipPosition === 'above' && tooltipY < chart.chartArea.top + 5) {
                    tooltipY = chart.chartArea.top + 5; // Keep minimum distance from top
                } else if (tooltipPosition === 'below' && tooltipY + tooltipHeight > chart.chartArea.bottom - 5) {
                    tooltipY = chart.chartArea.bottom - tooltipHeight - 5; // Keep minimum distance from bottom
                }
                
                // Draw tooltip background
                ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
                ctx.beginPath();
                // Use a compatible approach for rounded rectangle
                const radius = 4;
                ctx.moveTo(tooltipX + radius, tooltipY);
                ctx.lineTo(tooltipX + tooltipWidth - radius, tooltipY);
                ctx.quadraticCurveTo(tooltipX + tooltipWidth, tooltipY, tooltipX + tooltipWidth, tooltipY + radius);
                ctx.lineTo(tooltipX + tooltipWidth, tooltipY + tooltipHeight - radius);
                ctx.quadraticCurveTo(tooltipX + tooltipWidth, tooltipY + tooltipHeight, tooltipX + tooltipWidth - radius, tooltipY + tooltipHeight);
                ctx.lineTo(tooltipX + radius, tooltipY + tooltipHeight);
                ctx.quadraticCurveTo(tooltipX, tooltipY + tooltipHeight, tooltipX, tooltipY + tooltipHeight - radius);
                ctx.lineTo(tooltipX, tooltipY + radius);
                ctx.quadraticCurveTo(tooltipX, tooltipY, tooltipX + radius, tooltipY);
                ctx.closePath();
                ctx.fill();
                
                // Draw tooltip text
                ctx.fillStyle = '#ffffff';
                ctx.font = '12px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(tooltipText, tooltipX + tooltipWidth / 2, tooltipY + tooltipHeight / 2);
                
                ctx.restore();
                
                // Disable Chart.js tooltip for this point
                chart.tooltip.setActiveElements([], { datasetIndex: 0, index: closestIndex });
            }
        }
    };
    
    // Create the volume chart
    window.volumeChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Volume',
                data: data,
                backgroundColor: 'rgba(64, 159, 255, 0.7)', // Blue bars for volume
                borderColor: 'rgba(64, 159, 255, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 400 // Short animation duration for a subtle effect
            },
            plugins: {
                tooltip: {
                    enabled: false, // Disable default tooltips since we're using our custom ones
                    callbacks: {
                        label: function(context) {
                            const value = context.raw;
                            if (value === null) {
                                return 'No data available';
                            }
                            return `Volume: ${formatVolumeValue(value)}`;
                        }
                    }
                },
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#cccccc',
                        maxRotation: 45,
                        minRotation: 45,
                        // Limit the number of x-axis labels for readability
                        callback: function(val, index) {
                            // For longer ranges, show fewer labels
                            // Use the global selectedChartRange directly
                            const labelInterval = selectedChartRange === '1d' ? 1 : 
                                                selectedChartRange === '1w' ? 6 : 
                                                selectedChartRange === '2w' ? 12 : 
                                                selectedChartRange === '1m' ? 24 : 
                                                selectedChartRange === '2m' ? 48 :
                                                72; // For '3m', show every 72 hours
                            return index % labelInterval === 0 ? this.getLabelForValue(val) : '';
                        }
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#cccccc',
                        callback: function(value) {
                            return formatVolumeValue(value);
                        }
                    }
                }
            }
        },
        plugins: [missingDataPlugin, missingDataTooltipPlugin, volumeHorizontalHoverPlugin]
    });
    
    // Add mouse event listeners to the volume chart canvas
    const volumeChartCanvas = document.getElementById('volumeHistoryChart');
    
    volumeChartCanvas.addEventListener('mousemove', function(e) {
        const rect = this.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;
        
        activeChartId = 'volumeChart';
        isMouseOverChart = true;
        
        // Request animation frame to redraw all charts
        if (window.fundingChart) {
            window.fundingChart.render();
        }
        if (window.volumeChart) {
            window.volumeChart.render();
        }
        if (window.priceChart) {
            window.priceChart.render();
        }
    });
    
    volumeChartCanvas.addEventListener('mouseleave', function() {
        isMouseOverChart = false;
        activeChartId = null;
        hoverIndex = -1;
        
        // Redraw all charts to clear hover effects
        if (window.fundingChart) {
            window.fundingChart.render();
        }
        if (window.volumeChart) {
            window.volumeChart.render();
        }
        if (window.priceChart) {
            window.priceChart.render();
        }
    });
    
    volumeChartCanvas.addEventListener('mouseenter', function() {
        isMouseOverChart = true;
        activeChartId = 'volumeChart';
    });
}

$(document).ready(function() {
    $.getJSON('funding_data.json', function(data) {
        // Update the data timestamp (from exchange)
        $('#timestamp').text(data.timestamp);

        // Update the generated_at timestamp (when the script finished executing)
        $('#generated_at').text(data.generated_at);

        // Initialize the main table
        initializeTable(data);
        
        // Setup modal functionality
        setupModal();
        
        // Setup ADV range button functionality
        setupAdvRangeButton();
        
        // Clean up any existing display mode buttons and popups
        $('.mobile-display-mode-button').remove();
        $('.mobile-popup-container').each(function() {
            if ($(this).data('for') === 'displayMode') {
                $(this).remove();
            }
        });
        
        // Create mobile-friendly popup menu for display mode selector
        createMobilePopupMenu('displayMode', 'mobile-display-mode-button');
        
        // Setup chart resizing functionality
        setupChartResizing();
    }).fail(function(jqXHR, textStatus, errorThrown) {
        console.error("Failed to load data: " + textStatus + ", " + errorThrown);
        $('body').prepend('<div class="error-message">Failed to load funding data. Please try refreshing the page.</div>');
    });
});

// Function to initialize chart resizing functionality
function setupChartResizing() {
    // Store the minimum and maximum heights for charts
    const MIN_CHART_HEIGHT = 150; // Minimum height in pixels
    const MAX_CHART_HEIGHT = 600; // Maximum height in pixels
    const DEFAULT_CHART_HEIGHT = 300; // Default height in pixels
    
    // Chart settings object to store heights for each chart type
    const chartHeights = {
        funding: DEFAULT_CHART_HEIGHT,
        volume: DEFAULT_CHART_HEIGHT,
        price: DEFAULT_CHART_HEIGHT
    };
    
    // Function to update chart heights
    function updateChartHeight(chartType, height) {
        // Make sure height is within bounds
        height = Math.max(MIN_CHART_HEIGHT, Math.min(height, MAX_CHART_HEIGHT));
        
        // Store the height
        chartHeights[chartType] = height;
        
        // Update the chart container height
        if (chartType === 'funding') {
            $('#fundingChartContainer').height(height);
        } else if (chartType === 'volume') {
            $('#volumeChartContainer .chart-container').height(height);
        } else if (chartType === 'price') {
            $('#priceChartContainer .chart-container').height(height);
        }
        
        // Redraw the chart to fit new dimensions
        if (window.fundingChart && chartType === 'funding') {
            window.fundingChart.resize();
        } else if (window.volumeChart && chartType === 'volume') {
            window.volumeChart.resize();
        } else if (window.priceChart && chartType === 'price') {
            window.priceChart.resize();
        }
    }
    
    // Set up drag functionality for all resize handles
    $('.resize-handle').each(function() {
        const handle = $(this);
        const chartType = handle.data('chart');
        let startY = 0;
        let startHeight = 0;
        let isDragging = false;
        
        // Mouse event handlers
        handle.on('mousedown', function(e) {
            // Prevent text selection during drag
            e.preventDefault();
            
            // Start dragging
            isDragging = true;
            
            // Get the starting position and height
            startY = e.clientY;
            startHeight = chartHeights[chartType];
            
            // Add temporary event listeners for drag and end
            $(document).on('mousemove.chartResize', function(e) {
                if (!isDragging) return;
                
                // Calculate the new height
                // IMPORTANT: Dragging UP (negative change) DECREASES height
                //           Dragging DOWN (positive change) INCREASES height
                const deltaY = e.clientY - startY;
                const newHeight = startHeight + deltaY;
                
                // Update the chart height
                updateChartHeight(chartType, newHeight);
            });
            
            $(document).on('mouseup.chartResize mouseleave.chartResize', function() {
                // Stop dragging
                isDragging = false;
                
                // Remove temporary event listeners
                $(document).off('mousemove.chartResize mouseup.chartResize mouseleave.chartResize');
            });
        });
        
        // Touch event handlers for mobile
        handle.on('touchstart', function(e) {
            // Prevent scrolling during touch drag
            e.preventDefault();
            
            // Start dragging
            isDragging = true;
            
            // Get the starting position and height from the first touch point
            const touch = e.originalEvent.touches[0];
            startY = touch.clientY;
            startHeight = chartHeights[chartType];
            
            // Add temporary event listeners for drag and end
            $(document).on('touchmove.chartResize', function(e) {
                if (!isDragging) return;
                
                // Calculate the new height from the first touch point
                const touch = e.originalEvent.touches[0];
                const deltaY = touch.clientY - startY;
                const newHeight = startHeight + deltaY;
                
                // Update the chart height
                updateChartHeight(chartType, newHeight);
            });
            
            $(document).on('touchend.chartResize touchcancel.chartResize', function() {
                // Stop dragging
                isDragging = false;
                
                // Remove temporary event listeners
                $(document).off('touchmove.chartResize touchend.chartResize touchcancel.chartResize');
            });
        });
    });
}

// Function to set up the ADV range button
function setupAdvRangeButton() {
    const advRangeInput = $('#advRangeInput');
    
    // Initialize input with current value
    updateAdvRangeInput();
    
    // Update the column header on initialization
    updateAdvColumnHeader();
    
    // Handle focus event - change text to placeholder
    advRangeInput.on('focus', function() {
        // Store original value in case user cancels
        $(this).attr('data-original', $(this).val());
        
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        const inputElement = $(this).get(0);
        
        if (!isMobile) {
            // On desktop: change to placeholder text and select all
            $(this).val('select range 1 - 30d');
            inputElement.select();
            
            // Also use requestAnimationFrame for browsers that need a delay
            requestAnimationFrame(() => {
                inputElement.setSelectionRange(0, inputElement.value.length);
            });
        } else {
            // On mobile: show instruction text directly in the input field
            $(this).val('select range 1 - 30d');
            
            // Focus on the input and position cursor at the end
            inputElement.focus();
            setTimeout(() => {
                try {
                    // Position cursor at the end for easier editing
                    inputElement.setSelectionRange(inputElement.value.length, inputElement.value.length);
                } catch (e) {
                    console.log("Could not set selection range");
                }
            }, 50);
        }
    });
    
    // Handle blur event - if empty or invalid, restore previous value
    advRangeInput.on('blur', function() {
        const inputVal = $(this).val().trim();
        const originalVal = $(this).attr('data-original');
        
        // Clear any placeholder that was set
        $(this).removeAttr('placeholder');
        
        // If it's still the placeholder or empty, revert to previous state
        if (inputVal === 'select range 1 - 30d' || inputVal === '') {
            $(this).val(originalVal || `ADV ${advRangeDays}d`);
            return;
        }
        
        // Try to extract a number from the input
        const match = inputVal.match(/(\d+)/);
        if (match) {
            const days = parseInt(match[1]);
            if (!isNaN(days) && days >= 1 && days <= 30) {
                advRangeDays = days;
                updateAdvRangeInput();
                updateAdvColumnHeader();
                // Update table with ADV data for the new range
                updateADVData();
            } else {
                // Invalid number, revert
                $(this).val(originalVal || `ADV ${advRangeDays}d`);
            }
        } else {
            // No number found, revert
            $(this).val(originalVal || `ADV ${advRangeDays}d`);
        }
    });
    
    // Handle keydown event - process on Enter key
    advRangeInput.on('keydown', function(e) {
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        const inputVal = $(this).val().trim();
        
        if (e.key === 'Enter') {
            $(this).blur();
        } else if (e.key === 'Escape') {
            // Restore original value on Escape
            const originalVal = $(this).attr('data-original');
            $(this).val(originalVal || `ADV ${advRangeDays}d`);
            $(this).blur();
        } else if (isMobile && inputVal.includes('select range') && e.key >= '0' && e.key <= '9') {
            // If user is typing a number while instruction text is visible, replace it
            e.preventDefault();
            $(this).val(e.key);
        } else if (isMobile && e.key >= '0' && e.key <= '9') {
            // If typing a number, clear any existing timer
            clearTimeout(typingTimer);
        }
    });
    
    // Also handle click event to ensure text is selected (desktop only)
    advRangeInput.on('click', function() {
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        
        if (!isMobile && $(this).val() === 'select range 1 - 30d') {
            $(this).select();
        } else if (isMobile && $(this).val() === `ADV ${advRangeDays}d`) {
            // For mobile, when clicking on the button, show instruction text
            $(this).val('select range 1 - 30d');
            
            // Position cursor at the end for easier editing
            const inputElement = $(this).get(0);
            setTimeout(() => {
                try {
                    inputElement.setSelectionRange(inputElement.value.length, inputElement.value.length);
                } catch (e) {
                    console.log("Could not set selection range");
                }
            }, 50);
        }
    });
    
    // Add keyup handler for mobile to process input after a very long delay
    let typingTimer; // Timer identifier
    const doneTypingInterval = 60000; // Time in ms (1 minute) - intentionally long to give users plenty of time to think and enter numbers
    
    advRangeInput.on('keyup', function(e) {
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        
        if (isMobile) {
            const inputVal = $(this).val().trim();
            const input = $(this);
            
            // If the input still contains the instruction text, allow user to type over it
            if (inputVal.includes('select range')) {
                // If user is typing a number, replace the instruction text
                if (e.key >= '0' && e.key <= '9') {
                    $(this).val(e.key);
                }
                return;
            }
            
            // Clear timer on keyup
            clearTimeout(typingTimer);
            
            const match = inputVal.match(/^(\d+)$/);
            
            // If input is a valid number, set a timer before processing
            if (match) {
                const days = parseInt(match[1]);
                if (!isNaN(days) && days >= 1 && days <= 30) {
                    // If Enter key is pressed or it's a 2-digit number, process immediately
                    if (e.key === 'Enter' || (days >= 10 && days <= 30)) {
                        advRangeDays = days;
                        updateAdvRangeInput();
                        updateAdvColumnHeader();
                        updateADVData();
                        input.blur(); // Remove focus to hide keyboard
                    } else {
                        // For single-digit numbers, wait to see if user types another digit
                        typingTimer = setTimeout(function() {
                            // Only process if the input hasn't changed
                            if (input.val().trim() === inputVal) {
                                advRangeDays = days;
                                updateAdvRangeInput();
                                updateAdvColumnHeader();
                                updateADVData();
                                input.blur(); // Remove focus to hide keyboard
                            }
                        }, doneTypingInterval);
                    }
                }
            }
        }
    });
}

// Function to update the ADV range input text
function updateAdvRangeInput() {
    $('#advRangeInput').val(`ADV ${advRangeDays}d`);
}

// Function to update the ADV column header
function updateAdvColumnHeader() {
    // Get the DataTable instance
    const table = $('#fundingTable').DataTable();
    if (table) {
        // Update the column header for the ADV column (index 1)
        $(table.column(1).header()).html(`ADV (${advRangeDays}d)`);
    }
}

// Helper function to create mobile-friendly popup menus
function createMobilePopupMenu(selectId, buttonClass) {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (!isMobile) return; // Only apply on mobile devices
    
    const select = $(`#${selectId}`);
    if (!select.length) return;
    
    // Get current value and text - use global selectedChartRange for chart range selector
    let currentValue;
    let currentText;
    
    if (selectId === 'chartRangeSelect') {
        currentValue = selectedChartRange;
        currentText = select.find(`option[value="${selectedChartRange}"]`).text();
    } else {
        currentValue = select.val();
        currentText = select.find('option:selected').text();
    }
    
    // Create a button to replace the select
    const button = $(`<button class="${buttonClass}" data-value="${currentValue}">${currentText}</button>`);
    
    // Create popup menu container
    const popupContainer = $('<div class="mobile-popup-container"></div>');
    // Store which select this popup is for
    popupContainer.data('for', selectId);
    const popupMenu = $('<div class="mobile-popup-menu"></div>');
    
    // Add options to popup menu
    select.find('option').each(function() {
        const option = $(this);
        const value = option.val();
        const text = option.text();
        const optionElement = $(`<div class="mobile-popup-option" data-value="${value}">${text}</div>`);
        
        // Highlight current selection
        if (value === currentValue) {
            optionElement.addClass('selected');
        }
        
        // Add click handler to option
        optionElement.on('click', function(e) {
            // Stop propagation to prevent closing the chart popup
            e.stopPropagation();
            
            const selectedValue = $(this).data('value');
            const selectedText = $(this).text();
            
            // Update button text and value
            button.text(selectedText).data('value', selectedValue);
            
            // Update original select and trigger change event
            select.val(selectedValue).trigger('change');
            
            // Close popup
            popupContainer.hide();
            
            // Prevent any parent handlers from being executed
            return false;
        });
        
        popupMenu.append(optionElement);
    });
    
    // Add popup menu to container
    popupContainer.append(popupMenu);
    
    // Prevent clicks on the popup container from closing the chart popup
    popupContainer.on('click', function(e) {
        e.stopPropagation();
    });
    
    // Add click handler to button
    button.on('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        // Position popup menu
        const buttonPos = button.offset();
        popupContainer.css({
            top: buttonPos.top + button.outerHeight() + 5,
            left: buttonPos.left
        });
        
        // Show popup
        popupContainer.show();
        
        // Close popup when clicking outside, but don't propagate the event
        $(document).one('click', function(e) {
            popupContainer.hide();
            // Only stop propagation for clicks related to the chart range selector
            if (selectId === 'chartRangeSelect') {
                e.stopPropagation();
                return false;
            }
        });
    });
    
    // Hide select and add button and popup container
    select.hide().after(button);
    $('body').append(popupContainer);
}

// Function to load price data from the OHLCV data
function loadPriceData(coin, range) {
    // Show loading indicator
    $('#priceChartLoading').show();
    
    // Calculate the time range based on the selected range
    const now = Date.now();
    let startTime;
    
    switch (range) {
        case '1d':
            startTime = now - (24 * 60 * 60 * 1000); // 1 day in milliseconds
            break;
        case '1w':
            startTime = now - (7 * 24 * 60 * 60 * 1000); // 1 week in milliseconds
            break;
        case '2w':
            startTime = now - (14 * 24 * 60 * 60 * 1000); // 2 weeks in milliseconds
            break;
        case '1m':
            startTime = now - (30 * 24 * 60 * 60 * 1000); // 1 month (approx) in milliseconds
            break;
        case '2m':
            startTime = now - (60 * 24 * 60 * 60 * 1000); // 2 months (approx) in milliseconds
            break;
        case '3m':
            startTime = now - (90 * 24 * 60 * 60 * 1000); // 3 months (approx) in milliseconds
            break;
        default:
            startTime = now - (24 * 60 * 60 * 1000); // Default to 1 day
    }
    
    // Fetch the CSV file to get price data (from same file as volume data)
    $.ajax({
        url: '../ohlcv_data_main.csv',
        dataType: 'text',
        success: function(csvData) {
            console.log("Price CSV data loaded successfully");
            
            // Parse CSV data
            const rows = csvData.split('\n');
            console.log(`Price CSV has ${rows.length} rows`);
            
            // Try to detect CSV format
            const firstRow = rows[0].split(',');
            console.log(`Price CSV columns: ${firstRow.join(', ')}`);
            
            // Find column indices for price data
            const timeIndex = firstRow.indexOf('time');
            const coinIndex = firstRow.indexOf('coin');
            const closePriceIndex = firstRow.indexOf('close_price');
            
            if (timeIndex >= 0 && coinIndex >= 0 && closePriceIndex >= 0) {
                // Filter data for the selected coin and time range
                const priceData = [];
                const timeLabels = [];
                const timestamps = [];
                
                // Process each row
                for (let i = 1; i < rows.length; i++) {
                    if (!rows[i].trim()) continue; // Skip empty rows
                    
                    const columns = rows[i].split(',');
                    if (columns.length <= Math.max(coinIndex, closePriceIndex, timeIndex)) continue;
                    
                    const rowCoin = columns[coinIndex];
                    const closePrice = parseFloat(columns[closePriceIndex]);
                    const timestamp = parseInt(columns[timeIndex]);
                    
                    // Adjust timestamp to align with funding data
                    const adjustedTimestamp = timestamp + (60 * 60 * 1000);
                    
                    if (rowCoin === coin && adjustedTimestamp >= startTime && !isNaN(closePrice) && !isNaN(timestamp)) {
                        // Format time as hour (using adjusted timestamp for display)
                        const date = new Date(adjustedTimestamp);
                        // Shift time back by 1 hour to show the start of the collection period
                        date.setHours(date.getHours() - 1);
                        const timeLabel = date.toLocaleString([], {
                            hour: '2-digit',
                            hour12: true,
                            day: '2-digit',
                            month: '2-digit'
                        });
                        
                        priceData.push(closePrice);
                        timeLabels.push(timeLabel);
                        timestamps.push(adjustedTimestamp);
                    }
                }
                
                // Hide loading indicator
                $('#priceChartLoading').hide();
                
                if (priceData.length === 0) {
                    // No data found for this coin in the selected range
                    $('#priceChartContainer .chart-container').hide();
                    $('#priceChartContainer').append(`<p class="error-message">No price data available for ${coin} in the selected range (${range}).</p>`);
                    return;
                } else {
                    // Remove any previous error messages
                    $('#priceChartContainer .error-message').remove();
                    $('#priceChartContainer .chart-container').show();
                }
                
                console.log(`Found ${priceData.length} price data points for ${coin} in range ${range}`);
                
                // Sort data by timestamp (oldest first)
                const sortedData = [];
                const sortedLabels = [];
                const sortedTimestamps = [];
                
                // Create pairs of [timestamp, timeLabel, price] for sorting
                const pairs = timestamps.map((ts, index) => [ts, timeLabels[index], priceData[index]]);
                
                // Sort by timestamp
                pairs.sort((a, b) => a[0] - b[0]);
                
                // Extract sorted data
                pairs.forEach(pair => {
                    sortedTimestamps.push(pair[0]);
                    sortedLabels.push(pair[1]);
                    sortedData.push(pair[2]);
                });
                
                // Start from the selected range start time, rounded to the nearest hour
                const rangeStartTime = new Date(startTime);
                rangeStartTime.setMinutes(0, 0, 0);
                
                // Get current time for comparison
                const currentTime = new Date();
                currentTime.setMinutes(0, 0, 0);
                
                // Find the latest timestamp in the data
                let latestDataTime;
                if (sortedTimestamps.length > 0) {
                    const latestTimestamp = Math.max(...sortedTimestamps);
                    console.log(`Latest price timestamp in data: ${new Date(latestTimestamp).toLocaleString()}`);
                    
                    // Get the latest data point hour
                    latestDataTime = new Date(latestTimestamp);
                    latestDataTime.setMinutes(0, 0, 0);
                } else {
                    // If no data, use range start time as fallback
                    latestDataTime = new Date(rangeStartTime);
                    console.log(`No price data found, using range start time as latest data time: ${latestDataTime.toLocaleString()}`);
                }
                
                // Always use current time as end time to show missing data between latest data point and now
                const endTime = new Date(currentTime);
                console.log(`Price chart end time: ${endTime.toLocaleString()}`);
                console.log(`Latest price data time: ${latestDataTime.toLocaleString()}`);
                
                // Generate the complete time range including missing hours
                const completeTimeLabels = [];
                const completeData = [];
                
                // Create an array of all hours in the range
                for (let time = new Date(rangeStartTime); time <= endTime; time.setHours(time.getHours() + 1)) {
                    // Create a display time that's shifted back by 1 hour to show the start of the collection period
                    const displayTime = new Date(time);
                    displayTime.setHours(displayTime.getHours() - 1);
                    const timeLabel = displayTime.toLocaleString([], {
                        hour: '2-digit',
                        hour12: true,
                        day: '2-digit',
                        month: '2-digit'
                    });
                    completeTimeLabels.push(timeLabel);
                    
                    // Find if we have data for this hour
                    const matchingDataIndex = sortedTimestamps.findIndex(ts => {
                        const dataTime = new Date(ts);
                        return dataTime.getHours() === time.getHours() && 
                               dataTime.getDate() === time.getDate() && 
                               dataTime.getMonth() === time.getMonth() &&
                               dataTime.getFullYear() === time.getFullYear();
                    });
                    
                    // If we have data for this hour, use it; otherwise, use null to create a gap
                    if (matchingDataIndex !== -1) {
                        completeData.push(sortedData[matchingDataIndex]);
                    } else {
                        // Only mark as null if we're within the range where we expect data
                        if (sortedData.length > 0) {
                            // For hours between the latest data point and current time, mark as null to show missing data
                            if (time > latestDataTime && time <= endTime) {
                                completeData.push(null); // Missing data after latest data point
                            }
                            // For recent data, mark missing data as null
                            else {
                                const recentTimeThreshold = new Date(latestDataTime);
                                recentTimeThreshold.setHours(recentTimeThreshold.getHours() - 24);
                                
                                if (time >= recentTimeThreshold && time <= latestDataTime) {
                                    completeData.push(null); // Recent missing data point
                                } else if (time >= new Date(Math.min(...sortedTimestamps)) && 
                                    time <= latestDataTime) {
                                    completeData.push(null); // Truly missing data point within historical range
                                } else {
                                    completeData.push(undefined); // Outside data range, don't show indicator
                                }
                            }
                        } else {
                            completeData.push(undefined); // No data at all for this coin
                        }
                    }
                }
                
                console.log(`Complete price time range has ${completeTimeLabels.length} hours, with ${completeData.filter(d => d !== null && d !== undefined).length} data points and ${completeData.filter(d => d === null).length} missing points`);
                
                // Create price chart
                createPriceChart(completeTimeLabels, completeData);
            } else {
                // CSV format not recognized
                $('#priceChartLoading').hide();
                $('#priceChartContainer .chart-container').hide();
                $('#priceChartContainer').append('<p class="error-message">Could not parse price data format.</p>');
            }
        },
        error: function(xhr, status, error) {
            console.error("Error loading price CSV:", error);
            console.log("Status:", status);
            console.log("XHR:", xhr);
            
            // Show error message
            $('#priceChartLoading').hide();
            $('#priceChartContainer .chart-container').hide();
            $('#priceChartContainer').append('<p class="error-message">Failed to load price data.</p>');
        }
    });
}

// Function to create the price chart with area fill
function createPriceChart(labels, data) {
    const ctx = document.getElementById('priceHistoryChart').getContext('2d');
    
    // Destroy existing chart if it exists
    if (window.priceChart) {
        window.priceChart.destroy();
    }
    
    // Format price numbers for display
    function formatPriceValue(value) {
        if (value === null || value === undefined) {
            return 'No data';
        }
        
        // Format price with appropriate precision
        if (value >= 1000) {
            return value.toFixed(2);
        } else if (value >= 100) {
            return value.toFixed(3);
        } else if (value >= 10) {
            return value.toFixed(4);
        } else if (value >= 1) {
            return value.toFixed(5);
        } else {
            return value.toFixed(6);
        }
    }
    
    // Define missing data indicator plugin for line charts
    const missingDataPlugin = {
        id: 'missingPriceData',
        beforeDraw: function(chart) {
            const ctx = chart.ctx;
            const dataset = chart.data.datasets[0];
            const yAxis = chart.scales.y;
            const xAxis = chart.scales.x;
            
            // Draw yellow indicators for missing data
            for (let i = 0; i < dataset.data.length; i++) {
                if (dataset.data[i] === null && i > 0 && i < dataset.data.length) {
                    const x = xAxis.getPixelForValue(i);
                    
                    // Draw a vertical yellow line
                    ctx.save();
                    ctx.beginPath();
                    ctx.moveTo(x, yAxis.top);
                    ctx.lineTo(x, yAxis.bottom);
                    ctx.lineWidth = 1;
                    ctx.strokeStyle = 'rgba(255, 255, 0, 0.3)'; // Semi-transparent yellow
                    ctx.stroke();
                    ctx.restore();
                }
            }
        }
    };
    
    // Define price line sync with other charts
    const priceHorizontalHoverPlugin = {
        id: 'priceHorizontalHover',
        afterDraw: function(chart) {
            const ctx = chart.ctx;
            const dataset = chart.data.datasets[0];
            
            // If mouse is not over any chart, don't draw anything
            if (!isMouseOverChart) {
                return;
            }
            
            // If another chart is active and we're syncing, use the global hover index
            // Otherwise, find the closest point in this chart
            let closestIndex = -1;
            
            if (activeChartId && activeChartId !== 'priceChart') {
                // Use the global hover index if it's valid for this chart
                if (hoverIndex >= 0 && hoverIndex < dataset.data.length) {
                    closestIndex = hoverIndex;
                }
            } else {
                // Find closest point when mouse is over this chart
                let closestDistance = Number.MAX_VALUE;
                
                for (let i = 0; i < dataset.data.length; i++) {
                    // Skip null or undefined data points
                    if (dataset.data[i] === null || dataset.data[i] === undefined) continue;
                    
                    const x = chart.scales.x.getPixelForValue(i);
                    const distance = Math.abs(mouseX - x);
                    
                    if (distance < closestDistance) {
                        closestDistance = distance;
                        closestIndex = i;
                    }
                }
                
                // Update global hover index if this chart is active
                if (activeChartId === 'priceChart' || !activeChartId) {
                    hoverIndex = closestIndex;
                }
            }
            
            // If we found a closest data point and it's valid
            if (closestIndex !== -1 && (activeChartId === 'priceChart' || !activeChartId || activeChartId === 'fundingChart' || activeChartId === 'volumeChart')) {
                const x = chart.scales.x.getPixelForValue(closestIndex);
                const price = dataset.data[closestIndex];
                
                if (price !== null && price !== undefined) {
                    const y = chart.scales.y.getPixelForValue(price);
                    
                    // Draw vertical line
                    ctx.save();
                    ctx.beginPath();
                    ctx.moveTo(x, chart.chartArea.top);
                    ctx.lineTo(x, chart.chartArea.bottom);
                    ctx.lineWidth = 1;
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                    ctx.stroke();
                    
                    // Draw point at intersection with price line
                    ctx.beginPath();
                    ctx.arc(x, y, 5, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(255, 165, 0, 0.7)'; // Orange for price
                    ctx.fill();
                    ctx.strokeStyle = 'white';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    
                    // Draw tooltip with price value
                    const timeLabel = labels[closestIndex];
                    const tooltipText = `${timeLabel}: ${formatPriceValue(price)}`;
                    const tooltipWidth = ctx.measureText(tooltipText).width + 16;
                    const tooltipHeight = 24;
                    
                    // Calculate tooltip position
                    let tooltipX = x - tooltipWidth / 2;
                    let tooltipY = y - tooltipHeight - 10;
                    
                    // Adjust tooltip position if it would go off the chart
                    if (tooltipX < chart.chartArea.left) {
                        tooltipX = chart.chartArea.left + 5;
                    }
                    if (tooltipX + tooltipWidth > chart.chartArea.right) {
                        tooltipX = chart.chartArea.right - tooltipWidth - 5;
                    }
                    if (tooltipY < chart.chartArea.top) {
                        tooltipY = y + 15; // Show below point instead
                    }
                    
                    // Draw tooltip background
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
                    ctx.beginPath();
                    const radius = 4;
                    ctx.moveTo(tooltipX + radius, tooltipY);
                    ctx.lineTo(tooltipX + tooltipWidth - radius, tooltipY);
                    ctx.quadraticCurveTo(tooltipX + tooltipWidth, tooltipY, tooltipX + tooltipWidth, tooltipY + radius);
                    ctx.lineTo(tooltipX + tooltipWidth, tooltipY + tooltipHeight - radius);
                    ctx.quadraticCurveTo(tooltipX + tooltipWidth, tooltipY + tooltipHeight, tooltipX + tooltipWidth - radius, tooltipY + tooltipHeight);
                    ctx.lineTo(tooltipX + radius, tooltipY + tooltipHeight);
                    ctx.quadraticCurveTo(tooltipX, tooltipY + tooltipHeight, tooltipX, tooltipY + tooltipHeight - radius);
                    ctx.lineTo(tooltipX, tooltipY + radius);
                    ctx.quadraticCurveTo(tooltipX, tooltipY, tooltipX + radius, tooltipY);
                    ctx.closePath();
                    ctx.fill();
                    
                    // Draw tooltip text
                    ctx.fillStyle = '#ffffff';
                    ctx.font = '12px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(tooltipText, tooltipX + tooltipWidth / 2, tooltipY + tooltipHeight / 2);
                    
                    ctx.restore();
                }
            }
        }
    };
    
    // Create the price chart
    window.priceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Price',
                data: data,
                borderColor: 'rgba(255, 165, 0, 1)', // Orange line for price
                backgroundColor: 'rgba(255, 165, 0, 0.2)', // Transparent orange fill
                borderWidth: 2,
                pointRadius: 0, // Hide points
                pointHoverRadius: 5, // Show points on hover
                fill: true, // Enable fill below the line
                tension: 0.1 // Slightly smooth the line
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: false, // Let Chart.js determine the best Y scale
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)',
                        callback: function(value) {
                            return formatPriceValue(value);
                        }
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)',
                        maxRotation: 45,
                        minRotation: 45,
                        // Limit the number of x-axis labels for readability
                        callback: function(val, index) {
                            // For longer ranges, show fewer labels
                            const labelInterval = selectedChartRange === '1d' ? 1 : 
                                               selectedChartRange === '1w' ? 6 : 
                                               selectedChartRange === '2w' ? 12 : 
                                               selectedChartRange === '1m' ? 24 : 
                                               selectedChartRange === '2m' ? 48 :
                                               72; // For '3m', show every 72 hours
                            return index % labelInterval === 0 ? this.getLabelForValue(val) : '';
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    enabled: false // Disable built-in tooltips in favor of our custom one
                }
            },
            animation: false,
            interaction: {
                mode: 'index',
                intersect: false
            }
        },
        plugins: [missingDataPlugin, priceHorizontalHoverPlugin]
    });
    
    // Get reference to price chart canvas
    const priceChartCanvas = document.getElementById('priceHistoryChart');
    
    // Add mousemove handler to price chart
    priceChartCanvas.addEventListener('mousemove', function(e) {
        const rect = this.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;
        
        activeChartId = 'priceChart';
        isMouseOverChart = true;
        
        // Request animation frame to redraw all charts
        if (window.fundingChart) {
            window.fundingChart.render();
        }
        if (window.volumeChart) {
            window.volumeChart.render();
        }
        if (window.priceChart) {
            window.priceChart.render();
        }
    });
    
    // Add mouseout handler to price chart
    priceChartCanvas.addEventListener('mouseleave', function() {
        isMouseOverChart = false;
        activeChartId = null;
        hoverIndex = -1;
        
        // Redraw all charts to clear hover effects
        if (window.fundingChart) {
            window.fundingChart.render();
        }
        if (window.volumeChart) {
            window.volumeChart.render();
        }
        if (window.priceChart) {
            window.priceChart.render();
        }
    });
}

// Function to reorder chart containers based on the chartOrder array
function reorderChartContainers() {
    // Get the parent container
    const parentContainer = $('#coinInfoPopupContent');
    
    // Funding chart is always first (it's the main content)
    
    // For each additional chart type in the order
    chartOrder.forEach((chartType, index) => {
        if (index === 0) return; // Skip 'funding' as it's already the first element
        
        // Get the container for this chart type
        const chartContainer = $(`#${chartType}ChartContainer`);
        
        // Move it to the end of the parent container
        if (chartContainer.length) {
            parentContainer.append(chartContainer);
        }
    });
}

// Function to update the ADV data when range is changed
function updateADVData() {
    // Get the DataTable instance
    const table = $('#fundingTable').DataTable();
    if (!table) return;
    
    // Get current data from the JSON file
    $.getJSON('funding_data.json', function(data) {
        // Check if we have ADV data for the selected range
        if (data.adv_data && data.adv_data[`${advRangeDays}d`]) {
            const advData = data.adv_data[`${advRangeDays}d`];
            
            // Update each row with the new ADV data
            table.rows().every(function() {
                const rowData = this.data();
                const coin = rowData.coin;
                
                // Update ADV value if we have data for this coin
                if (advData[coin] !== undefined) {
                    rowData.adv = advData[coin];
                } else {
                    rowData.adv = null;
                }
                
                this.data(rowData);
            });
            
            // Redraw the table with the new data
            table.draw();
        } else {
            console.warn(`No ADV data available for ${advRangeDays}d range`);
        }
    }).fail(function() {
        console.error("Failed to load ADV data");
    });
}
