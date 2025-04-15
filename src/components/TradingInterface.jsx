﻿import React, { useState, useEffect, useCallback } from 'react';
import { DollarSign, TrendingUp, TrendingDown, AlertTriangle, Target, Clock, Settings, PlayCircle, StopCircle, RefreshCw, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import axios from 'axios';

const TradingInterface = ({ strategy }) => {
  // Trading settings state
  const [isAutoTrading, setIsAutoTrading] = useState(false);
  const [tradeSettings, setTradeSettings] = useState({
    investment: 1000,
    stopLoss: 5,
    takeProfit: 10,
    trailingStop: false,
    maxTrades: 5,
    timeFrame: '5m'
  });

  // Position and market state
  const [position, setPosition] = useState({
    type: null, // 'buy' or 'sell'
    entryPrice: null,
    quantity: null,
    profit: null,
    status: 'closed' // 'open' or 'closed'
  });
  const [marketPrice, setMarketPrice] = useState(100.25);
  const [marketPrediction, setMarketPrediction] = useState(null);
  
  // New states for sentiment model
  const [sentimentPrediction, setSentimentPrediction] = useState(null);
  const [isLoadingSentiment, setIsLoadingSentiment] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Auto trading state
  const [tradeCount, setTradeCount] = useState(0);
  const [lastSignal, setLastSignal] = useState(null);
  const [autoTradeInterval, setAutoTradeInterval] = useState(null);
  const [notification, setNotification] = useState(null);
  const [tradeHistory, setTradeHistory] = useState([]);

  // Format strategy name for display
  const formatStrategyName = useCallback((strategyName) => {
    if (strategyName === 'sentiment_analysis' || strategyName === 'sentiment-analysis') {
      return 'Sentiment Analysis';
    } else if (strategyName === 'momentum_trading' || strategyName === 'momentum-trading') {
      return 'Momentum Trading';
    } else {
      return strategyName.charAt(0).toUpperCase() + strategyName.slice(1);
    }
  }, []);

  // current model based on strategy
  const getCurrentModel = useCallback(() => {
    switch(strategy) {
      case 'sentiment':
      case 'sentiment_analysis':
        return 'sentiment';
      case 'momentum_trading':
      case 'momentum':
        return 'momentum';
      case 'macd':
        return 'macd';
      case 'transformer':
        return 'transformer';
      case 'moving_average':
      default:
        return 'moving_average';
    }
  }, [strategy]);

  // model display name
  const getModelDisplayName = useCallback(() => {
    const model = getCurrentModel();
    switch(model) {
      case 'sentiment':
        return 'Sentiment Analysis';
      case 'momentum':
        return 'Momentum Trading';
      case 'macd':
        return 'MACD';
      case 'moving_average':
        return 'Moving Average';
      case 'transformer':
        return 'Transformer';
      default:
        return 'Unknown';
    }
  }, [getCurrentModel]);

  // settings changes
  const handleSettingsChange = (e) => {
    const { name, value, type, checked } = e.target;
    setTradeSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (type === 'number' ? parseFloat(value) : value)
    }));
  };

  // current market price (simulated)
  const getCurrentMarketPrice = async () => {
    try {
      const newPrice = 100.25 + (Math.random() * 5 - 2.5); // Random price around 100.25
      setMarketPrice(newPrice);
      return newPrice;
    } catch (error) {
      console.error("Error fetching market price:", error);
      return marketPrice; 
    }
  };

  // Checking if stop loss or take profit is triggered
  const checkStopLossAndTakeProfit = useCallback(async () => {
    if (position.status !== 'open') return;
    
    try {
      const currentPrice = await getCurrentMarketPrice();
      let shouldClose = false;
      let profitAmount = 0;
      let closeReason = '';
      
      if (position.type === 'buy') {
        // Calculate profit/loss percentage for long position
        const priceDiff = currentPrice - position.entryPrice;
        const percentChange = (priceDiff / position.entryPrice) * 100;
        profitAmount = position.quantity * priceDiff;
        
        // Check stop loss
        if (percentChange <= -tradeSettings.stopLoss) {
          shouldClose = true;
          closeReason = 'Stop loss';
          setNotification({
            type: 'error',
            message: `Stop loss triggered at ${currentPrice.toFixed(2)}`
          });
        }
        
        // Check take profit
        if (percentChange >= tradeSettings.takeProfit) {
          shouldClose = true;
          closeReason = 'Take profit';
          setNotification({
            type: 'success',
            message: `Take profit triggered at ${currentPrice.toFixed(2)}`
          });
        }
      } else if (position.type === 'sell') {
        // Calculate profit/loss percentage for short position
        const priceDiff = position.entryPrice - currentPrice;
        const percentChange = (priceDiff / position.entryPrice) * 100;
        profitAmount = position.quantity * priceDiff;
        
        // Check stop loss
        if (percentChange <= -tradeSettings.stopLoss) {
          shouldClose = true;
          closeReason = 'Stop loss';
          setNotification({
            type: 'error',
            message: `Stop loss triggered at ${currentPrice.toFixed(2)}`
          });
        }
        
        // Check take profit
        if (percentChange >= tradeSettings.takeProfit) {
          shouldClose = true;
          closeReason = 'Take profit';
          setNotification({
            type: 'success',
            message: `Take profit triggered at ${currentPrice.toFixed(2)}`
          });
        }
      }
      
      // Close position if needed
      if (shouldClose) {
        await closePosition(profitAmount, closeReason);
      }
    } catch (error) {
      console.error("Error checking stop loss/take profit:", error);
    }
  }, [position, tradeSettings.stopLoss, tradeSettings.takeProfit]);

  // prediction based on current strategy model
  const fetchPrediction = useCallback(async () => {
    const currentModel = getCurrentModel();
    
    if (currentModel === 'moving_average' || currentModel === 'momentum' || currentModel === 'macd' || currentModel === 'transformer') {
      setIsLoading(true);
    } else if (currentModel === 'sentiment') {
      setIsLoadingSentiment(true);
    }
    
    try {
      // checking if data file exists
      const fileCheckResponse = await axios.get("http://localhost:5000/api/check-file", {
        validateStatus: (status) => status < 500,
      });
      
      // If file doesn't exist, trigger data fetch
      if (!fileCheckResponse.data.exists) {
        console.log("Stock data file not found. Fetching fresh data...");
        await axios.get("http://localhost:5000/api/fetch-data", {
          validateStatus: (status) => status < 500,
        });
      }
      
      let endpoint;
      switch(currentModel) {
        case 'sentiment':
          endpoint = "http://localhost:5001/api/predict-sentiment";
          break;
        case 'momentum':
          endpoint = "http://localhost:5001/api/predict-momentum";
          break;
        case 'macd':
          endpoint = "http://localhost:5001/api/predict-macd";
          break;
        case 'transformer':
          endpoint = "http://localhost:5001/api/predict-transformer";
          break;
        case 'moving_average':
        default:
          endpoint = "http://localhost:5001/api/predict";
          break;
      }
      
      const response = await axios.get(endpoint, {
        validateStatus: (status) => status < 500,
      });
      
      const signal = response.data.message;
      console.log(`Received ${getModelDisplayName()} prediction signal:`, signal);
      
      if (currentModel === 'moving_average' || currentModel === 'momentum' || currentModel === 'macd' || currentModel === 'transformer') {
        setMarketPrediction(signal);
        setIsLoading(false);
      } else if (currentModel === 'sentiment') {
        setSentimentPrediction(signal);
        setIsLoadingSentiment(false);
      }
      
      setLastSignal(signal);
      return signal;
    } catch (error) {
      console.error("Error fetching prediction:", error);
      if (currentModel === 'moving_average' || currentModel === 'momentum' || currentModel === 'macd' || currentModel === 'transformer') {
        setIsLoading(false);
      } else if (currentModel === 'sentiment') {
        setIsLoadingSentiment(false);
      }
      return null;
    }
  }, [getCurrentModel, getModelDisplayName]);

  // Parsing prediction to determine trading signal
  const getTradingSignalFromPrediction = useCallback((prediction) => {
    if (!prediction) return null;
    
    const currentModel = getCurrentModel();
    console.log(`Analyzing ${getModelDisplayName()} prediction signal:`, prediction);
    
    if (currentModel === 'moving_average') {
      if (prediction === "📈 Uptrend (Buy)") {
        console.log(`EXACT MATCH: Buy signal detected from ${getModelDisplayName()}`);
        return 'buy';
      } else if (prediction === "📉 Downtrend (Sell)") {
        console.log(`EXACT MATCH: Sell signal detected from ${getModelDisplayName()}`);
        return 'sell';
      }
    } else if (currentModel === 'sentiment') {
      if (prediction === "📈 Positive Sentiment (Buy)") {
        console.log(`EXACT MATCH: Buy signal detected from ${getModelDisplayName()}`);
        return 'buy';
      } else if (prediction === "📉 Negative Sentiment (Sell)") {
        console.log(`EXACT MATCH: Sell signal detected from ${getModelDisplayName()}`);
        return 'sell';
      }
    } else if (currentModel === 'momentum') {
      if (prediction === "📈 Strong Momentum (Buy)") {
        console.log(`EXACT MATCH: Buy signal detected from ${getModelDisplayName()}`);
        return 'buy';
      } else if (prediction === "📉 Weak Momentum (Sell)") {
        console.log(`EXACT MATCH: Sell signal detected from ${getModelDisplayName()}`);
        return 'sell';
      }
    } else if (currentModel === 'macd') {
      if (prediction === "📈 MACD Uptrend (Buy)") {
        console.log(`EXACT MATCH: Buy signal detected from ${getModelDisplayName()}`);
        return 'buy';
      } else if (prediction === "📉 MACD Downtrend (Sell)") {
        console.log(`EXACT MATCH: Sell signal detected from ${getModelDisplayName()}`);
        return 'sell';
      } else if (prediction === "↔️ MACD Neutral (Hold)") {
        console.log(`EXACT MATCH: Hold signal detected from ${getModelDisplayName()}`);
        return null;
      }
    } else if (currentModel === 'transformer') {
      if (prediction === "📈 Transformer Uptrend (Buy)") {
        console.log(`EXACT MATCH: Buy signal detected from ${getModelDisplayName()}`);
        return 'buy';
      } else if (prediction === "📉 Transformer Downtrend (Sell)") {
        console.log(`EXACT MATCH: Sell signal detected from ${getModelDisplayName()}`);
        return 'sell';
      } else if (prediction === "↔️ Transformer Neutral (Hold)") {
        console.log(`EXACT MATCH: Hold signal detected from ${getModelDisplayName()}`);
        return null;
      }
    }
    
    console.log(`No exact signal match detected in ${getModelDisplayName()} prediction`);
    return null;
  }, [getCurrentModel, getModelDisplayName]);

  // Getting current prediction based on strategy model
  const getCurrentPrediction = useCallback(() => {
    const currentModel = getCurrentModel();
    if (currentModel === 'sentiment') {
      return sentimentPrediction;
    } else {
      return marketPrediction;
    }
  }, [getCurrentModel, marketPrediction, sentimentPrediction]);

  // Opening a new position
  const openPosition = async (type) => {
    try {
      const currentPrice = await getCurrentMarketPrice();
      const quantity = Math.floor(tradeSettings.investment / currentPrice);
      const timestamp = new Date().toLocaleString();
      const currentModel = getCurrentModel();
      const modelDisplayName = getModelDisplayName();
      
      setPosition({
        type,
        entryPrice: currentPrice,
        quantity: quantity,
        profit: 0,
        status: 'open',
        openTime: timestamp,
        model: currentModel,
        modelDisplay: modelDisplayName,
        strategy
      });
      
      setTradeHistory(prev => [
        {
          id: Date.now(),
          type: type,
          action: 'OPEN',
          price: currentPrice,
          quantity: quantity,
          timestamp: timestamp,
          reason: `${formatStrategyName(strategy)} strategy signal`,
          model: currentModel,
          modelDisplay: modelDisplayName,
          strategy
        },
        ...prev
      ]);
      
      setNotification({
        type: 'info',
        message: `${type.toUpperCase()} position opened at ${currentPrice.toFixed(2)} (${formatStrategyName(strategy)} strategy)`
      });
      
      setTimeout(() => setNotification(null), 3000);
      
      if (isAutoTrading) {
        setTradeCount(prev => prev + 1);
      }
      
      return true;
    } catch (error) {
      console.error("Error opening position:", error);
      setNotification({
        type: 'error',
        message: 'Failed to open position'
      });
      
      setTimeout(() => setNotification(null), 3000);
      return false;
    }
  };

  // Closing the current position
  const closePosition = async (profit = null, reason = 'Manual close') => {
    try {
      const currentPrice = await getCurrentMarketPrice();
      let profitAmount = profit;
      const timestamp = new Date().toLocaleString();
      const currentModel = position.model || getCurrentModel();
      const modelDisplayName = position.modelDisplay || getModelDisplayName();
      
      if (profitAmount === null) {
        if (position.type === 'buy') {
          profitAmount = position.quantity * (currentPrice - position.entryPrice);
        } else {
          profitAmount = position.quantity * (position.entryPrice - currentPrice);
        }
      }
      
      setTradeHistory(prev => [
        {
          id: Date.now(),
          type: position.type,
          action: 'CLOSE',
          price: currentPrice,
          quantity: position.quantity,
          profit: profitAmount,
          timestamp: timestamp,
          reason: reason,
          model: currentModel,
          modelDisplay: modelDisplayName,
          strategy: position.strategy || strategy
        },
        ...prev
      ]);
      
      setPosition(prev => ({
        ...prev,
        status: 'closed',
        profit: profitAmount,
        closeTime: timestamp
      }));
      
      setNotification({
        type: profitAmount >= 0 ? 'success' : 'error',
        message: `Position closed with ${profitAmount >= 0 ? 'profit' : 'loss'}: $${Math.abs(profitAmount).toFixed(2)}`
      });
      
      setLastSignal(`${position.type === 'buy' ? 'Sell' : 'Buy'} (${strategy})`);
      
      setTimeout(() => setNotification(null), 3000);
      return true;
    } catch (error) {
      console.error("Error closing position:", error);
      setNotification({
        type: 'error',
        message: 'Failed to close position'
      });
      
      setTimeout(() => setNotification(null), 3000);
      return false;
    }
  };

  // Handling manual trading
  const handleTrade = async (type) => {
    if (position.status === 'closed') {
      await openPosition(type);
    } else {
      await closePosition();
    }
  };

  // Auto trading core logic - using strategy-determined model
  const executeAutoTrade = useCallback(async () => {
    console.log("==== AUTO TRADE EXECUTION ====");
    console.log(`Current strategy: ${formatStrategyName(strategy)} (using ${getModelDisplayName()} model)`);
    const currentPrediction = getCurrentPrediction();
    console.log(`Current prediction from ${getModelDisplayName()} model:`, currentPrediction);
    console.log("Current position status:", position.status);
    
    if (tradeCount >= tradeSettings.maxTrades) {
      console.log(`Reached maximum trades (${tradeCount}/${tradeSettings.maxTrades}), stopping auto trading`);
      setIsAutoTrading(false);
      setNotification({
        type: 'info',
        message: `Auto trading stopped: Reached maximum ${tradeSettings.maxTrades} trades`
      });
      
      setTimeout(() => setNotification(null), 3000);
      return;
    }
    
    if (!currentPrediction) {
      console.log(`No ${getModelDisplayName()} prediction available, fetching new prediction...`);
      const prediction = await fetchPrediction();
      
      if (!prediction) {
        console.log("Failed to fetch prediction");
        return;
      }
    }
    
    const signal = getTradingSignalFromPrediction(currentPrediction);
    console.log(`Trading signal from ${getModelDisplayName()} model:`, signal);
    
    if (!signal) {
      console.log("No valid signal detected in model prediction");
      return;
    }
    
    if (position.status === 'open') {
      if ((position.type === 'buy' && signal === 'sell') || 
          (position.type === 'sell' && signal === 'buy')) {
        console.log(`SIGNAL CHANGE DETECTED: Closing ${position.type.toUpperCase()} position due to ${signal.toUpperCase()} signal`);
        await closePosition(null, `Signal changed to ${signal[0].toUpperCase() + signal.slice(1)} (${position.modelDisplay || getModelDisplayName()})`);
        
        console.log(`Opening new ${signal.toUpperCase()} position immediately after closing`);
        await openPosition(signal);
      } else {
        console.log(`Signal matches current position (${position.type}), checking stop loss/take profit...`);
        await checkStopLossAndTakeProfit();
      }
    } else {
      console.log(`Opening new ${signal.toUpperCase()} position based on ${getModelDisplayName()} model signal`);
      await openPosition(signal);
    }
  }, [
    strategy,
    position.status,
    position.type,
    tradeCount,
    tradeSettings.maxTrades,
    getCurrentPrediction,
    getTradingSignalFromPrediction,
    checkStopLossAndTakeProfit,
    openPosition,
    closePosition,
    fetchPrediction,
    formatStrategyName,
    getModelDisplayName
  ]);

  // Toggle auto trading on/off with strategy-based model
  const toggleAutoTrading = () => {
    const newAutoTradingState = !isAutoTrading;
    setIsAutoTrading(newAutoTradingState);
    
    if (newAutoTradingState) {
      const modelDisplayName = getModelDisplayName();
      const currentModel = getCurrentModel();
      
      setPosition(prev => ({
        ...prev,
        model: currentModel,
        modelDisplay: modelDisplayName,
        strategy
      }));
      
      console.log(`==== STARTING AUTO TRADING MODE WITH ${formatStrategyName(strategy).toUpperCase()} STRATEGY (${modelDisplayName.toUpperCase()} MODEL) ====`);
      setTradeCount(0);
      
      fetchPrediction().then(prediction => {
        console.log(`Fresh ${modelDisplayName} prediction received:`, prediction);
        
        if (position.status === 'open') {
          console.log("Closing existing position before starting auto trading");
          closePosition(null, 'Auto trading started').then(() => {
            const signal = getTradingSignalFromPrediction(prediction);
            if (signal) {
              console.log(`Executing immediate ${signal} signal from ${modelDisplayName} model`);
              openPosition(signal);
            } else {
              console.log("No valid signal detected in model prediction");
            }
          });
        } else {
          const signal = getTradingSignalFromPrediction(prediction);
          if (signal) {
            console.log(`Executing immediate ${signal} signal from ${modelDisplayName} model`);
            openPosition(signal);
          } else {
            console.log("No valid signal detected in model prediction");
          }
        }
      });
      
      setNotification({
        type: 'info',
        message: `Auto trading started - using ${formatStrategyName(strategy)} strategy`
      });
    } else {
      console.log("==== STOPPING AUTO TRADING MODE ====");
      setNotification({
        type: 'info',
        message: 'Auto trading stopped'
      });
    }
    
    setTimeout(() => setNotification(null), 3000);
  };

  useEffect(() => {
    if (isAutoTrading) {
      console.log(`Auto trading mode is active with ${formatStrategyName(strategy)} strategy (${getModelDisplayName()} model), setting up continuous monitoring`);
      
      executeAutoTrade();
      
      const interval = setInterval(() => {
        console.log(`Auto trading cycle - Using ${formatStrategyName(strategy)} strategy (${getModelDisplayName()} model)`);
        
        executeAutoTrade();
      }, 5000);
      
      setAutoTradeInterval(interval);
      
      return () => {
        console.log("Cleaning up auto trading interval");
        clearInterval(interval);
      };
    } else if (autoTradeInterval) {
      console.log("Auto trading disabled, clearing interval");
      clearInterval(autoTradeInterval);
      setAutoTradeInterval(null);
    }
  }, [
    isAutoTrading, 
    executeAutoTrade,
    autoTradeInterval,
    strategy,
    formatStrategyName,
    getModelDisplayName
  ]);

  useEffect(() => {
    console.log(`Setting up ${getModelDisplayName()} prediction monitoring for ${formatStrategyName(strategy)} strategy`);
    
    fetchPrediction();
    
    const predictionInterval = setInterval(() => {
      if (isAutoTrading) {
        console.log(`Fetching fresh ${getModelDisplayName()} prediction for ${formatStrategyName(strategy)} auto trading...`);
        fetchPrediction();
      }
    }, 15000);
    
    return () => {
      console.log("Cleaning up prediction interval");
      clearInterval(predictionInterval);
    };
  }, [fetchPrediction, isAutoTrading, strategy, formatStrategyName, getModelDisplayName]);

  useEffect(() => {
    const priceUpdateInterval = setInterval(() => {
      getCurrentMarketPrice();
    }, 3000);
    
    return () => clearInterval(priceUpdateInterval);
  }, []);

  const calculateCurrentProfitLoss = () => {
    if (position.status !== 'open' || !position.entryPrice) return null;
    
    let profitLoss = 0;
    if (position.type === 'buy') {
      profitLoss = position.quantity * (marketPrice - position.entryPrice);
    } else {
      profitLoss = position.quantity * (position.entryPrice - marketPrice);
    }
    
    return profitLoss;
  };

  const currentProfitLoss = calculateCurrentProfitLoss();

  return (
    <div className="bg-gray-800 rounded-xl p-8 mb-8">
      {notification && (
        <div className={`mb-4 p-3 rounded-lg text-white font-medium flex items-center justify-between ${
          notification.type === 'success' ? 'bg-green-600' :
          notification.type === 'error' ? 'bg-red-600' :
          'bg-blue-600'
        }`}>
          <p>{notification.message}</p>
          <button 
            onClick={() => setNotification(null)}
            className="text-white ml-2"
          >
            ✕
          </button>
        </div>
      )}
      
      <div className="grid md:grid-cols-2 gap-8">
        <div>
          <h3 className="text-2xl font-bold text-white mb-6">Trading Controls</h3>
          
          <div className="flex gap-4 mb-8">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleTrade('buy')}
              disabled={isAutoTrading}
              className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-600 text-white py-4 rounded-lg font-semibold flex items-center justify-center gap-2"
            >
              <TrendingUp className="h-5 w-5" />
              {position.status === 'open' ? 'Close Position' : 'Buy'}
            </motion.button>
            
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleTrade('sell')}
              disabled={isAutoTrading}
              className="flex-1 bg-red-500 hover:bg-red-600 disabled:bg-gray-600 text-white py-4 rounded-lg font-semibold flex items-center justify-center gap-2"
            >
              <TrendingDown className="h-5 w-5" />
              {position.status === 'open' ? 'Close Position' : 'Sell'}
            </motion.button>
          </div>

          <div className="mb-8">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={toggleAutoTrading}
              className={`w-full py-4 rounded-lg font-semibold flex items-center justify-center gap-2 ${
                isAutoTrading 
                  ? 'bg-red-500 hover:bg-red-600' 
                  : 'bg-emerald-500 hover:bg-emerald-600'
              } text-white`}
            >
              {isAutoTrading ? (
                <>
                  <StopCircle className="h-5 w-5" />
                  Stop Auto Trading
                </>
              ) : (
                <>
                  <PlayCircle className="h-5 w-5" />
                  Start Auto Trading
                </>
              )}
            </motion.button>
            
            {isAutoTrading && (
              <div className="mt-3 bg-blue-500/20 border border-blue-500/30 rounded-lg p-3 text-sm text-blue-300">
                <div className="flex items-center">
                  <AlertCircle className="h-4 w-4 mr-2" />
                  <span>Auto trading is active. The system will execute trades based on market signals.</span>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-gray-400 mb-2">Investment Amount ($)</label>
              <input
                type="number"
                name="investment"
                value={tradeSettings.investment}
                onChange={handleSettingsChange}
                disabled={isAutoTrading}
                className="w-full bg-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-70"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-400 mb-2">Stop Loss (%)</label>
                <input
                  type="number"
                  name="stopLoss"
                  value={tradeSettings.stopLoss}
                  onChange={handleSettingsChange}
                  disabled={isAutoTrading}
                  className="w-full bg-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-70"
                />
              </div>
              <div>
                <label className="block text-gray-400 mb-2">Take Profit (%)</label>
                <input
                  type="number"
                  name="takeProfit"
                  value={tradeSettings.takeProfit}
                  onChange={handleSettingsChange}
                  disabled={isAutoTrading}
                  className="w-full bg-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-70"
                />
              </div>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                name="trailingStop"
                checked={tradeSettings.trailingStop}
                onChange={handleSettingsChange}
                disabled={isAutoTrading}
                className="h-4 w-4 text-emerald-500 rounded border-gray-300 focus:ring-emerald-500 disabled:opacity-70"
              />
              <label className="ml-2 text-gray-400">Enable Trailing Stop</label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-400 mb-2">Max Trades</label>
                <input
                  type="number"
                  name="maxTrades"
                  value={tradeSettings.maxTrades}
                  onChange={handleSettingsChange}
                  disabled={isAutoTrading}
                  className="w-full bg-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-70"
                />
              </div>
              <div>
                <label className="block text-gray-400 mb-2">Time Frame</label>
                <select
                  name="timeFrame"
                  value={tradeSettings.timeFrame}
                  onChange={handleSettingsChange}
                  disabled={isAutoTrading}
                  className="w-full bg-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-70"
                >
                  <option value="1m">1 minute</option>
                  <option value="5m">5 minutes</option>
                  <option value="15m">15 minutes</option>
                  <option value="1h">1 hour</option>
                  <option value="4h">4 hours</option>
                  <option value="1d">1 day</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-2xl font-bold text-white mb-6">Position Details</h3>
          
          <div className="bg-gray-700 rounded-xl p-6 mb-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-gray-400 mb-1">Position Type</p>
                <p className="text-xl font-semibold text-white">
                  {position.type ? (
                    <span className={position.type === 'buy' ? 'text-green-400' : 'text-red-400'}>
                      {position.type.toUpperCase()}
                    </span>
                  ) : (
                    'No Position'
                  )}
                </p>
              </div>
              <div>
                <p className="text-gray-400 mb-1">Status</p>
                <p className="text-xl font-semibold text-white">
                  {position.status.toUpperCase()}
                </p>
              </div>
              <div>
                <p className="text-gray-400 mb-1">Entry Price</p>
                <p className="text-xl font-semibold text-white">
                  {position.entryPrice ? `$${position.entryPrice.toFixed(2)}` : '-'}
                </p>
              </div>
              <div>
                <p className="text-gray-400 mb-1">Quantity</p>
                <p className="text-xl font-semibold text-white">
                  {position.quantity || '-'}
                </p>
              </div>
            </div>
            
            {position.status === 'open' && (
              <div className="mt-4 bg-gray-800 rounded-lg p-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Current Price:</span>
                  <span className="text-white font-semibold">${marketPrice.toFixed(2)}</span>
                </div>
                {currentProfitLoss !== null && (
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-gray-400">Unrealized P/L:</span>
                    <span className={`font-semibold ${currentProfitLoss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      ${currentProfitLoss.toFixed(2)} ({((currentProfitLoss / (position.entryPrice * position.quantity)) * 100).toFixed(2)}%)
                    </span>
                  </div>
                )}
              </div>
            )}
            
            {isAutoTrading && (
              <div className="mt-4 bg-gray-800 rounded-lg p-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Auto Trading Status:</span>
                  <span className="text-emerald-400 font-semibold">Active</span>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-gray-400">Trading Strategy:</span>
                  <span className="text-white font-semibold">
                    {formatStrategyName(strategy)}
                  </span>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-gray-400">Trades Executed:</span>
                  <span className="text-white font-semibold">{tradeCount} / {tradeSettings.maxTrades}</span>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-gray-400">Last Signal:</span>
                  <span className={`font-semibold ${
                    (getCurrentModel() === 'moving_average' && lastSignal && (lastSignal.includes('Buy') || lastSignal.includes('Uptrend'))) ||
                    (getCurrentModel() === 'sentiment' && lastSignal && lastSignal.includes('Positive')) ||
                    (getCurrentModel() === 'momentum' && lastSignal && lastSignal.includes('Strong')) ||
                    (getCurrentModel() === 'macd' && lastSignal && lastSignal.includes('Uptrend'))
                      ? 'text-green-400' 
                      : getCurrentModel() === 'macd' && lastSignal && lastSignal.includes('Neutral')
                          ? 'text-yellow-400'
                          : 'text-red-400'
                  }`}>
                    {lastSignal || 'None'}
                  </span>
                </div>
              </div>
            )}
          </div>
          
          <div className="bg-gray-700 rounded-xl p-6 mb-6">
            <h4 className="text-white font-semibold mb-4">Trade History</h4>
            {tradeHistory.length > 0 ? (
              <div className="overflow-y-auto max-h-60">
                {tradeHistory.map((trade) => (
                  <div key={trade.id} className="border-b border-gray-600 last:border-0 py-3">
                    <div className="flex justify-between mb-1">
                      <span className={`font-semibold ${
                        trade.action === 'OPEN' 
                          ? 'text-blue-400'
                          : trade.profit >= 0 
                            ? 'text-green-400' 
                            : 'text-red-400'
                      }`}>
                        {trade.action} {trade.type.toUpperCase()}
                      </span>
                      <span className="text-gray-400 text-sm">{trade.timestamp}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">
                        Price: ${trade.price.toFixed(2)} × {trade.quantity}
                      </span>
                      {trade.action === 'CLOSE' && (
                        <span className={trade.profit >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {trade.profit >= 0 ? '+' : ''}{trade.profit.toFixed(2)}
                        </span>
                      )}
                    </div>
                    <div className="flex justify-between text-xs mt-1">
                      <span className="text-gray-500">
                        {trade.reason}
                      </span>
                      {trade.strategy && (
                        <span className="text-emerald-400 font-medium">
                          {formatStrategyName(trade.strategy)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-gray-400 text-center py-4">
                No trades have been executed yet
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Target className="h-5 w-5 text-emerald-400 mr-2" />
                <span className="text-gray-400">Win Rate</span>
              </div>
              <span className="text-white font-semibold">78.5%</span>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <DollarSign className="h-5 w-5 text-emerald-400 mr-2" />
                <span className="text-gray-400">Profit Factor</span>
              </div>
              <span className="text-white font-semibold">2.4</span>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Clock className="h-5 w-5 text-emerald-400 mr-2" />
                <span className="text-gray-400">Avg Trade Duration</span>
              </div>
              <span className="text-white font-semibold">45 min</span>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <AlertTriangle className="h-5 w-5 text-emerald-400 mr-2" />
                <span className="text-gray-400">Max Drawdown</span>
              </div>
              <span className="text-white font-semibold">12.5%</span>
            </div>
          </div>
        </div>

        <div className="mb-6 bg-gray-700 rounded-xl p-4">
          <div className="flex flex-col space-y-4">
            <div className="bg-gray-800 rounded-lg p-3 mb-2">
              <h4 className="text-white font-semibold mb-1">Current Strategy</h4>
              <div className="flex items-center">
                <div className="bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-sm font-medium">
                  {formatStrategyName(strategy)}
                </div>
              </div>
            </div>
            
            <div>
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-white font-semibold">Strategy Prediction</h4>
                <button 
                  onClick={fetchPrediction}
                  disabled={(getCurrentModel() === 'moving_average' || getCurrentModel() === 'momentum' ? isLoading : isLoadingSentiment) || isAutoTrading}
                  className="p-2 bg-gray-600 hover:bg-gray-500 disabled:opacity-50 rounded-lg text-white flex items-center"
                >
                  {(getCurrentModel() === 'moving_average' || getCurrentModel() === 'momentum' ? isLoading : isLoadingSentiment) ? 
                    <RefreshCw className="h-4 w-4 animate-spin" /> : 
                    <RefreshCw className="h-4 w-4" />
                  }
                </button>
              </div>
              
              <div className="bg-gray-800 rounded-lg p-4">
                {getCurrentPrediction() ? (
                  <div className={`text-xl font-bold text-center ${
                    (getCurrentModel() === 'moving_average' && 
                    (getCurrentPrediction().includes('Buy') || getCurrentPrediction().includes('Uptrend'))) ||
                    (getCurrentModel() === 'sentiment' && getCurrentPrediction().includes('Positive')) ||
                    (getCurrentModel() === 'momentum' && getCurrentPrediction().includes('Strong')) ||
                    (getCurrentModel() === 'macd' && getCurrentPrediction().includes('Uptrend'))
                      ? 'text-green-400' 
                      : getCurrentModel() === 'macd' && getCurrentPrediction().includes('Neutral')
                          ? 'text-yellow-400'
                          : 'text-red-400'
                  }`}>
                    {getCurrentPrediction()}
                  </div>
                ) : (
                  <div className="text-gray-400 flex items-center justify-center">
                    {(getCurrentModel() === 'moving_average' || getCurrentModel() === 'momentum' || getCurrentModel() === 'macd' ? isLoading : isLoadingSentiment) ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                        Loading prediction...
                      </>
                    ) : (
                      'No prediction available'
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TradingInterface;