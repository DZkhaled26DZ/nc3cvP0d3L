const API_KEY = 'nc3cvP0d3LZzL9AIIgQQsjU6MKN8g5oanFkiAo4BdykbaOlce3HsTbWB3mPCoL8z';
const BINANCE_WS_URL = 'wss://stream.binance.com:9443/ws';
const BINANCE_API_URL = 'https://api.binance.com/api/v3';

class CryptoAnalyzer {
    constructor() {
        this.isRunning = false;
        this.soundEnabled = false;
        this.volume = 0.5;
        this.results = new Map();
        this.sockets = new Map();
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('startBtn').addEventListener('click', () => this.toggleAnalysis());
        document.getElementById('randomBtn').addEventListener('click', () => this.startRandomAnalysis());
        document.getElementById('refreshBtn').addEventListener('click', () => this.refreshData());
        document.getElementById('soundToggle').addEventListener('click', () => this.toggleSound());
        document.getElementById('volumeControl').addEventListener('input', (e) => this.setVolume(e.target.value));
        
        document.querySelectorAll('th[data-sort]').forEach(header => {
            header.addEventListener('click', () => this.sortTable(header.dataset.sort));
        });
    }

    getSelectedTimeframes(type) {
        return Array.from(document.querySelectorAll(`#${type} input:checked`))
            .map(input => input.value);
    }

    async getSymbols() {
        try {
            const response = await fetch(`${BINANCE_API_URL}/exchangeInfo`);
            const data = await response.json();
            return data.symbols
                .filter(symbol => symbol.quoteAsset === 'USDT' && symbol.status === 'TRADING')
                .map(symbol => symbol.symbol);
        } catch (error) {
            console.error('Error fetching symbols:', error);
            return [];
        }
    }

    async getKlines(symbol, interval) {
        try {
            const response = await fetch(
                `${BINANCE_API_URL}/klines?symbol=${symbol}&interval=${interval}&limit=100`
            );
            return await response.json();
        } catch (error) {
            console.error(`Error fetching klines for ${symbol}:`, error);
            return [];
        }
    }

    calculateMACD(closes) {
        const fastPeriod = 12;
        const slowPeriod = 26;
        const signalPeriod = 9;
        
        const ema12 = this.calculateEMA(closes, fastPeriod);
        const ema26 = this.calculateEMA(closes, slowPeriod);
        
        const macdLine = ema12.map((value, index) => value - ema26[index]);
        const signalLine = this.calculateEMA(macdLine, signalPeriod);
        
        return {
            macdLine,
            signalLine,
            histogram: macdLine.map((value, index) => value - signalLine[index])
        };
    }

    calculateEMA(data, period) {
        const k = 2 / (period + 1);
        let ema = [data[0]];
        
        for (let i = 1; i < data.length; i++) {
            ema.push(data[i] * k + ema[i - 1] * (1 - k));
        }
        
        return ema;
    }

    async analyzeSymbol(symbol, timeframes) {
        const analyses = await Promise.all(
            timeframes.map(async timeframe => {
                const klines = await this.getKlines(symbol, timeframe);
                if (klines.length < 27) return null;

                const closes = klines.map(k => parseFloat(k[4]));
                const { macdLine, signalLine, histogram } = this.calculateMACD(closes);
                
                const lastIndex = macdLine.length - 1;
                const crossover = macdLine[lastIndex] > signalLine[lastIndex] && 
                                macdLine[lastIndex - 1] <= signalLine[lastIndex - 1];
                
                const belowZero = macdLine[lastIndex] < 0 && signalLine[lastIndex] < 0;
                
                return {
                    timeframe,
                    crossover,
                    belowZero,
                    macdTrend: histogram[lastIndex] > histogram[lastIndex - 1] ? 'صعودي' : 'هبوطي',
                    price: closes[lastIndex],
                    volume: parseFloat(klines[lastIndex][5]),
                    timestamp: new Date(klines[lastIndex][0]).toLocaleString('en-US')
                };
            })
        );

        return analyses.filter(a => a !== null);
    }

    async startAnalysis() {
        if (this.isRunning) return;
        
        const selectedTimeframes = this.getSelectedTimeframes('linePositionTimeframes');
        const crossoverTimeframes = this.getSelectedTimeframes('crossoverTimeframes');
        
        if (!selectedTimeframes.length || !crossoverTimeframes.length) {
            alert('الرجاء اختيار الإطارات الزمنية المطلوبة');
            return;
        }
        
        this.isRunning = true;
        const startBtn = document.getElementById('startBtn');
        startBtn.classList.add('active');
        startBtn.textContent = 'إيقاف البحث';
        
        const symbols = await this.getSymbols();
        
        for (const symbol of symbols) {
            const analyses = await this.analyzeSymbol(symbol, [...selectedTimeframes, ...crossoverTimeframes]);
            
            const matchesConditions = analyses.every(a => 
                (selectedTimeframes.includes(a.timeframe) ? a.belowZero : true) &&
                (crossoverTimeframes.includes(a.timeframe) ? a.crossover : true)
            );
            
            if (matchesConditions) {
                this.addResult(symbol, analyses);
                if (this.soundEnabled) this.playNotification();
            }
        }
    }

    addResult(symbol, analyses) {
        const row = document.createElement('tr');
        
        const mainAnalysis = analyses[0];
        const targets = this.calculateTargets(mainAnalysis.price);
        const stopLoss = this.calculateStopLoss(mainAnalysis.price);
        
        row.innerHTML = `
            <td>${symbol}</td>
            <td>${mainAnalysis.price.toFixed(8)}</td>
            <td>${mainAnalysis.timestamp}</td>
            <td>${mainAnalysis.volume.toFixed(2)}</td>
            <td class="${mainAnalysis.macdTrend === 'صعودي' ? 'trend-up' : 'trend-down'}">${mainAnalysis.macdTrend}</td>
            <t <boltAction type="file" filePath="script.js">d>${analyses.map(a => a.timeframe).join(', ')}</td>
            <td>${targets.map(t => t.toFixed(8)).join('<br>')}</td>
            <td>${stopLoss.toFixed(8)}</td>
        `;
        
        document.querySelector('#resultsTable tbody').appendChild(row);
    }

    calculateTargets(price) {
        return [1.3, 1.5, 1.7].map(multiplier => price * multiplier);
    }

    calculateStopLoss(price) {
        return price * 0.95;
    }

    startRandomAnalysis() {
        const timeframes = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '1d'];
        const randomLinePositions = this.getRandomElements(timeframes, Math.floor(Math.random() * 3) + 1);
        const randomCrossover = this.getRandomElements(timeframes, 1);
        
        // Uncheck all checkboxes
        document.querySelectorAll('.timeframe-option input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = false;
        });
        
        // Check selected random timeframes
        randomLinePositions.forEach(tf => {
            document.querySelector(`#line${tf}`).checked = true;
        });
        
        randomCrossover.forEach(tf => {
            document.querySelector(`#cross${tf}`).checked = true;
        });
        
        this.startAnalysis();
    }

    getRandomElements(array, count) {
        const shuffled = [...array].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, count);
    }

    toggleAnalysis() {
        if (this.isRunning) {
            this.isRunning = false;
            const startBtn = document.getElementById('startBtn');
            startBtn.classList.remove('active');
            startBtn.textContent = 'بدء البحث';
        } else {
            this.startAnalysis();
        }
    }

    refreshData() {
        document.querySelector('#resultsTable tbody').innerHTML = '';
        if (this.isRunning) {
            this.toggleAnalysis();
            this.toggleAnalysis();
        }
    }

    toggleSound() {
        this.soundEnabled = !this.soundEnabled;
        const button = document.getElementById('soundToggle');
        button.textContent = this.soundEnabled ? '🔊' : '🔇';
        button.classList.toggle('active', this.soundEnabled);
    }

    setVolume(value) {
        this.volume = value / 100;
        document.getElementById('notificationSound').volume = this.volume;
    }

    playNotification() {
        const sound = document.getElementById('notificationSound');
        sound.volume = this.volume;
        sound.play().catch(error => console.error('Error playing notification:', error));
    }

    sortTable(column) {
        const tbody = document.querySelector('#resultsTable tbody');
        const rows = Array.from(tbody.querySelectorAll('tr'));
        const headers = document.querySelectorAll('th');
        const headerIndex = Array.from(headers).findIndex(th => th.dataset.sort === column);
        
        rows.sort((a, b) => {
            const aValue = a.children[headerIndex].textContent;
            const bValue = b.children[headerIndex].textContent;
            
            if (column === 'price' || column === 'volume') {
                return parseFloat(aValue) - parseFloat(bValue);
            }
            return aValue.localeCompare(bValue);
        });
        
        tbody.innerHTML = '';
        rows.forEach(row => tbody.appendChild(row));
    }
}

// Initialize the analyzer when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new CryptoAnalyzer();
});