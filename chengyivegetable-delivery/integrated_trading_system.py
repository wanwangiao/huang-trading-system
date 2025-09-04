"""
自適應交易系統 - 主系統整合器
Integrated Trading System - 統一整合所有5個Agent模組的核心系統
"""

import asyncio
import logging
import signal
import sys
import threading
import time
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Callable, Tuple
from dataclasses import dataclass, field
from enum import Enum
from contextlib import asynccontextmanager
import json
import traceback

# 導入系統配置
from system_config import get_config, get_config_manager, SystemConfig

# 導入各Agent模組
# Agent 1: 市場數據系統
sys.path.append(r'C:\Users\黃士嘉\market_data_system')
from market_data_collector import MarketDataCollector
from data_storage import get_db_manager
from api_manager import get_api_manager

# Agent 2: 技術分析引擎
from technical_indicators import TechnicalIndicators
from pattern_recognition import PatternRecognizer
from signal_generator import SignalGenerator

# Agent 3: 機器學習框架
from ml_models import MLModelManager
from feature_engineering import FeatureEngineer
from prediction_engine import PredictionEngine
from online_learning import OnlineLearningManager

# Agent 4: 回測驗證系統
from backtester import Backtester
from performance_analyzer import PerformanceAnalyzer
from statistics import StatisticsCalculator
from walk_forward_analysis import WalkForwardAnalyzer

# Agent 5: 防過度優化系統
from risk_manager import RiskManager
from validation import ValidationManager
from anti_overfitting import AntiOverfittingValidator
from monte_carlo_validation import MonteCarloValidator


class SystemStatus(Enum):
    """系統狀態枚舉"""
    STOPPED = "stopped"
    INITIALIZING = "initializing"
    RUNNING = "running"
    PAUSED = "paused"
    ERROR = "error"
    SHUTTING_DOWN = "shutting_down"


@dataclass
class SystemMetrics:
    """系統性能指標"""
    cpu_usage: float = 0.0
    memory_usage: float = 0.0
    disk_usage: float = 0.0
    network_io: float = 0.0
    active_threads: int = 0
    processed_signals: int = 0
    successful_trades: int = 0
    failed_trades: int = 0
    current_portfolio_value: float = 0.0
    daily_pnl: float = 0.0
    max_drawdown: float = 0.0
    sharpe_ratio: float = 0.0
    last_update: datetime = field(default_factory=datetime.now)


@dataclass
class TradingSignal:
    """交易信號數據結構"""
    symbol: str
    signal_type: str  # BUY, SELL, HOLD
    confidence: float
    price: float
    timestamp: datetime
    source: str  # technical, ml, combined
    metadata: Dict[str, Any] = field(default_factory=dict)


class IntegratedTradingSystem:
    """自適應交易系統主整合器"""
    
    def __init__(self, config_path: Optional[str] = None):
        """初始化交易系統"""
        self.config_manager = get_config_manager(config_path)
        self.config = self.config_manager.config
        self.logger = logging.getLogger(__name__)
        
        # 系統狀態
        self.status = SystemStatus.STOPPED
        self.metrics = SystemMetrics()
        self.is_running = False
        self.shutdown_event = asyncio.Event()
        
        # 各模組實例
        self.modules = {}
        self.data_streams = {}
        self.signal_queue = asyncio.Queue()
        self.error_handler = None
        
        # 性能監控
        self.performance_monitor = None
        self.health_checker = None
        
        # 回調函數
        self.callbacks: Dict[str, List[Callable]] = {
            'on_signal': [],
            'on_trade': [],
            'on_error': [],
            'on_status_change': []
        }
        
        self.logger.info(f"Integrated Trading System initialized - Version {self.config.version}")
    
    async def initialize(self) -> bool:
        """初始化所有模組"""
        self.status = SystemStatus.INITIALIZING
        self.logger.info("Starting system initialization...")
        
        try:
            # 1. 初始化數據庫連接
            await self._initialize_database()
            
            # 2. 初始化各Agent模組
            await self._initialize_modules()
            
            # 3. 設置數據流和信號處理
            await self._setup_data_streams()
            
            # 4. 初始化監控系統
            await self._initialize_monitoring()
            
            # 5. 驗證系統完整性
            if await self._validate_system():
                self.logger.info("System initialization completed successfully")
                return True
            else:
                self.logger.error("System validation failed")
                return False
                
        except Exception as e:
            self.logger.error(f"System initialization failed: {e}")
            self.logger.error(traceback.format_exc())
            self.status = SystemStatus.ERROR
            return False
    
    async def _initialize_database(self):
        """初始化數據庫連接"""
        self.logger.info("Initializing database connections...")
        
        # 初始化主數據庫
        self.db_manager = get_db_manager()
        await self.db_manager.initialize()
        
        # 測試連接
        if not await self.db_manager.test_connection():
            raise Exception("Database connection failed")
        
        self.logger.info("Database connections established")
    
    async def _initialize_modules(self):
        """初始化所有Agent模組"""
        self.logger.info("Initializing all agent modules...")
        
        # Agent 1: 市場數據收集系統
        self.modules['market_data'] = MarketDataCollector()
        self.modules['api_manager'] = get_api_manager()
        
        # Agent 2: 技術分析引擎
        self.modules['technical_indicators'] = TechnicalIndicators()
        self.modules['pattern_recognizer'] = PatternRecognizer()
        self.modules['signal_generator'] = SignalGenerator()
        
        # Agent 3: 機器學習框架
        self.modules['ml_models'] = MLModelManager()
        self.modules['feature_engineer'] = FeatureEngineer()
        self.modules['prediction_engine'] = PredictionEngine()
        self.modules['online_learning'] = OnlineLearningManager()
        
        # Agent 4: 回測驗證系統
        self.modules['backtester'] = Backtester()
        self.modules['performance_analyzer'] = PerformanceAnalyzer()
        self.modules['statistics'] = StatisticsCalculator()
        self.modules['walk_forward'] = WalkForwardAnalyzer()
        
        # Agent 5: 防過度優化系統
        self.modules['risk_manager'] = RiskManager()
        self.modules['validation_manager'] = ValidationManager()
        self.modules['anti_overfitting'] = AntiOverfittingValidator()
        self.modules['monte_carlo'] = MonteCarloValidator()
        
        # 初始化各模組
        for module_name, module in self.modules.items():
            try:
                if hasattr(module, 'initialize'):
                    await module.initialize(self.config)
                self.logger.info(f"Module {module_name} initialized")
            except Exception as e:
                self.logger.error(f"Failed to initialize {module_name}: {e}")
                raise
        
        self.logger.info("All modules initialized successfully")
    
    async def _setup_data_streams(self):
        """設置數據流和信號處理管道"""
        self.logger.info("Setting up data streams and signal processing...")
        
        # 設置市場數據流
        self.data_streams['market_data'] = asyncio.Queue()
        self.data_streams['technical_signals'] = asyncio.Queue()
        self.data_streams['ml_predictions'] = asyncio.Queue()
        self.data_streams['risk_alerts'] = asyncio.Queue()
        
        # 啟動數據處理任務
        self.tasks = [
            asyncio.create_task(self._process_market_data()),
            asyncio.create_task(self._process_technical_analysis()),
            asyncio.create_task(self._process_ml_predictions()),
            asyncio.create_task(self._process_risk_management()),
            asyncio.create_task(self._process_trading_signals())
        ]
        
        self.logger.info("Data streams and processing tasks started")
    
    async def _initialize_monitoring(self):
        """初始化監控系統"""
        self.logger.info("Initializing monitoring systems...")
        
        # 啟動性能監控
        self.performance_monitor = asyncio.create_task(self._monitor_performance())
        
        # 啟動健康檢查
        self.health_checker = asyncio.create_task(self._health_check())
        
        self.logger.info("Monitoring systems started")
    
    async def _validate_system(self) -> bool:
        """驗證系統完整性"""
        self.logger.info("Validating system integrity...")
        
        try:
            # 檢查所有模組狀態
            for module_name, module in self.modules.items():
                if hasattr(module, 'health_check'):
                    if not await module.health_check():
                        self.logger.error(f"Module {module_name} health check failed")
                        return False
            
            # 檢查數據庫連接
            if not await self.db_manager.test_connection():
                self.logger.error("Database connection check failed")
                return False
            
            # 檢查配置有效性
            config_errors = self.config_manager.validate_config()
            if config_errors:
                self.logger.error(f"Configuration validation failed: {config_errors}")
                return False
            
            self.logger.info("System validation passed")
            return True
            
        except Exception as e:
            self.logger.error(f"System validation error: {e}")
            return False
    
    async def start(self) -> bool:
        """啟動交易系統"""
        if self.status == SystemStatus.RUNNING:
            self.logger.warning("System is already running")
            return True
        
        self.logger.info("Starting Integrated Trading System...")
        
        # 初始化系統
        if not await self.initialize():
            return False
        
        # 設置信號處理
        self._setup_signal_handlers()
        
        # 啟動系統
        self.status = SystemStatus.RUNNING
        self.is_running = True
        self.shutdown_event.clear()
        
        # 啟動數據收集
        await self.modules['market_data'].start()
        
        # 通知狀態變更
        await self._notify_callbacks('on_status_change', self.status)
        
        self.logger.info("Integrated Trading System started successfully")
        return True
    
    async def stop(self):
        """停止交易系統"""
        if self.status == SystemStatus.STOPPED:
            return
        
        self.logger.info("Stopping Integrated Trading System...")
        self.status = SystemStatus.SHUTTING_DOWN
        self.is_running = False
        
        try:
            # 停止數據收集
            if 'market_data' in self.modules:
                await self.modules['market_data'].stop()
            
            # 取消所有任務
            if hasattr(self, 'tasks'):
                for task in self.tasks:
                    task.cancel()
                await asyncio.gather(*self.tasks, return_exceptions=True)
            
            # 停止監控任務
            if self.performance_monitor:
                self.performance_monitor.cancel()
            if self.health_checker:
                self.health_checker.cancel()
            
            # 關閉數據庫連接
            if hasattr(self, 'db_manager'):
                await self.db_manager.close()
            
            self.status = SystemStatus.STOPPED
            self.shutdown_event.set()
            
            await self._notify_callbacks('on_status_change', self.status)
            self.logger.info("Integrated Trading System stopped")
            
        except Exception as e:
            self.logger.error(f"Error during shutdown: {e}")
            self.status = SystemStatus.ERROR
    
    async def pause(self):
        """暫停交易系統"""
        if self.status == SystemStatus.RUNNING:
            self.status = SystemStatus.PAUSED
            self.logger.info("Trading system paused")
            await self._notify_callbacks('on_status_change', self.status)
    
    async def resume(self):
        """恢復交易系統"""
        if self.status == SystemStatus.PAUSED:
            self.status = SystemStatus.RUNNING
            self.logger.info("Trading system resumed")
            await self._notify_callbacks('on_status_change', self.status)
    
    async def _process_market_data(self):
        """處理市場數據流"""
        while self.is_running:
            try:
                if self.status != SystemStatus.RUNNING:
                    await asyncio.sleep(1)
                    continue
                
                # 從市場數據流獲取數據
                if hasattr(self.modules['market_data'], 'get_latest_data'):
                    market_data = await self.modules['market_data'].get_latest_data()
                    if market_data:
                        # 存儲數據
                        await self.db_manager.store_market_data(market_data)
                        
                        # 發送到技術分析流
                        await self.data_streams['market_data'].put(market_data)
                
                await asyncio.sleep(1)  # 控制頻率
                
            except Exception as e:
                self.logger.error(f"Error processing market data: {e}")
                await asyncio.sleep(5)  # 錯誤後等待
    
    async def _process_technical_analysis(self):
        """處理技術分析"""
        while self.is_running:
            try:
                if self.status != SystemStatus.RUNNING:
                    await asyncio.sleep(1)
                    continue
                
                # 獲取市場數據
                market_data = await asyncio.wait_for(
                    self.data_streams['market_data'].get(), timeout=1.0
                )
                
                # 計算技術指標
                indicators = self.modules['technical_indicators'].calculate_all(market_data)
                
                # 識別型態
                patterns = self.modules['pattern_recognizer'].recognize_patterns(market_data)
                
                # 生成技術信號
                technical_signal = self.modules['signal_generator'].generate_signal(
                    market_data, indicators, patterns
                )
                
                if technical_signal:
                    signal = TradingSignal(
                        symbol=technical_signal.symbol,
                        signal_type=technical_signal.action,
                        confidence=technical_signal.confidence,
                        price=technical_signal.price,
                        timestamp=datetime.now(),
                        source='technical',
                        metadata={
                            'indicators': indicators,
                            'patterns': patterns
                        }
                    )
                    
                    await self.signal_queue.put(signal)
                    await self.data_streams['technical_signals'].put(signal)
                
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                self.logger.error(f"Error in technical analysis: {e}")
                await asyncio.sleep(1)
    
    async def _process_ml_predictions(self):
        """處理機器學習預測"""
        while self.is_running:
            try:
                if self.status != SystemStatus.RUNNING:
                    await asyncio.sleep(1)
                    continue
                
                # 獲取市場數據
                market_data = await asyncio.wait_for(
                    self.data_streams['market_data'].get(), timeout=1.0
                )
                
                # 特徵工程
                features = self.modules['feature_engineer'].create_features(market_data)
                
                # 生成預測
                prediction = await self.modules['prediction_engine'].predict(features)
                
                if prediction:
                    ml_signal = TradingSignal(
                        symbol=prediction.symbol,
                        signal_type=prediction.predicted_direction,
                        confidence=prediction.confidence,
                        price=prediction.predicted_price,
                        timestamp=datetime.now(),
                        source='ml',
                        metadata={
                            'model_name': prediction.model_name,
                            'features': features
                        }
                    )
                    
                    await self.signal_queue.put(ml_signal)
                    await self.data_streams['ml_predictions'].put(ml_signal)
                
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                self.logger.error(f"Error in ML prediction: {e}")
                await asyncio.sleep(1)
    
    async def _process_risk_management(self):
        """處理風險管理"""
        while self.is_running:
            try:
                if self.status != SystemStatus.RUNNING:
                    await asyncio.sleep(1)
                    continue
                
                # 獲取當前投組狀態
                portfolio_status = await self._get_portfolio_status()
                
                # 風險檢查
                risk_assessment = self.modules['risk_manager'].assess_risk(portfolio_status)
                
                if risk_assessment.alert_level > 0:
                    await self.data_streams['risk_alerts'].put(risk_assessment)
                    await self._notify_callbacks('on_error', risk_assessment)
                
                await asyncio.sleep(10)  # 每10秒檢查一次
                
            except Exception as e:
                self.logger.error(f"Error in risk management: {e}")
                await asyncio.sleep(10)
    
    async def _process_trading_signals(self):
        """處理交易信號整合"""
        while self.is_running:
            try:
                if self.status != SystemStatus.RUNNING:
                    await asyncio.sleep(1)
                    continue
                
                # 獲取信號
                signal = await asyncio.wait_for(self.signal_queue.get(), timeout=1.0)
                
                # 風險檢查
                if not self.modules['risk_manager'].validate_signal(signal):
                    self.logger.info(f"Signal rejected by risk manager: {signal.symbol}")
                    continue
                
                # 信號確認和過濾
                confirmed_signal = await self._confirm_signal(signal)
                
                if confirmed_signal:
                    # 執行交易（模擬）
                    trade_result = await self._execute_trade(confirmed_signal)
                    
                    if trade_result:
                        self.metrics.successful_trades += 1
                        await self._notify_callbacks('on_trade', trade_result)
                    else:
                        self.metrics.failed_trades += 1
                
                self.metrics.processed_signals += 1
                
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                self.logger.error(f"Error processing trading signals: {e}")
                await asyncio.sleep(1)
    
    async def _confirm_signal(self, signal: TradingSignal) -> Optional[TradingSignal]:
        """信號確認和多指標融合"""
        # 這裡可以實現多時間框架確認、多指標投票等邏輯
        # 簡化實現
        if signal.confidence > self.config.technical_analysis.signal_threshold:
            return signal
        return None
    
    async def _execute_trade(self, signal: TradingSignal) -> Optional[Dict[str, Any]]:
        """執行交易（模擬）"""
        # 實際實現中這裡會連接到券商API
        self.logger.info(f"Executing {signal.signal_type} for {signal.symbol} at {signal.price}")
        
        return {
            'symbol': signal.symbol,
            'action': signal.signal_type,
            'price': signal.price,
            'quantity': 100,  # 簡化
            'timestamp': datetime.now(),
            'status': 'executed'
        }
    
    async def _get_portfolio_status(self) -> Dict[str, Any]:
        """獲取投資組合狀態"""
        # 實際實現中從數據庫或券商API獲取
        return {
            'total_value': 100000.0,
            'cash': 50000.0,
            'positions': {},
            'daily_pnl': 0.0,
            'unrealized_pnl': 0.0
        }
    
    async def _monitor_performance(self):
        """性能監控"""
        import psutil
        
        while self.is_running:
            try:
                # 更新系統指標
                self.metrics.cpu_usage = psutil.cpu_percent(interval=1)
                self.metrics.memory_usage = psutil.virtual_memory().percent
                self.metrics.disk_usage = psutil.disk_usage('/').percent
                self.metrics.active_threads = threading.active_count()
                self.metrics.last_update = datetime.now()
                
                # 檢查警告閾值
                if self.metrics.cpu_usage > self.config.alert_threshold['cpu_usage']:
                    self.logger.warning(f"High CPU usage: {self.metrics.cpu_usage}%")
                
                if self.metrics.memory_usage > self.config.alert_threshold['memory_usage']:
                    self.logger.warning(f"High memory usage: {self.metrics.memory_usage}%")
                
                await asyncio.sleep(30)  # 每30秒更新一次
                
            except Exception as e:
                self.logger.error(f"Error in performance monitoring: {e}")
                await asyncio.sleep(30)
    
    async def _health_check(self):
        """健康檢查"""
        while self.is_running:
            try:
                # 檢查各模組健康狀態
                unhealthy_modules = []
                for module_name, module in self.modules.items():
                    if hasattr(module, 'health_check'):
                        if not await module.health_check():
                            unhealthy_modules.append(module_name)
                
                if unhealthy_modules:
                    self.logger.error(f"Unhealthy modules: {unhealthy_modules}")
                
                # 檢查數據庫連接
                if not await self.db_manager.test_connection():
                    self.logger.error("Database connection unhealthy")
                
                await asyncio.sleep(self.config.health_check_interval)
                
            except Exception as e:
                self.logger.error(f"Error in health check: {e}")
                await asyncio.sleep(60)
    
    def _setup_signal_handlers(self):
        """設置系統信號處理"""
        def signal_handler(sig, frame):
            self.logger.info(f"Received signal {sig}, shutting down...")
            asyncio.create_task(self.stop())
        
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
    
    def add_callback(self, event_type: str, callback: Callable):
        """添加回調函數"""
        if event_type in self.callbacks:
            self.callbacks[event_type].append(callback)
    
    async def _notify_callbacks(self, event_type: str, data: Any):
        """通知回調函數"""
        if event_type in self.callbacks:
            for callback in self.callbacks[event_type]:
                try:
                    if asyncio.iscoroutinefunction(callback):
                        await callback(data)
                    else:
                        callback(data)
                except Exception as e:
                    self.logger.error(f"Error in callback {callback}: {e}")
    
    def get_status(self) -> Dict[str, Any]:
        """獲取系統狀態"""
        return {
            'status': self.status.value,
            'metrics': {
                'cpu_usage': self.metrics.cpu_usage,
                'memory_usage': self.metrics.memory_usage,
                'active_threads': self.metrics.active_threads,
                'processed_signals': self.metrics.processed_signals,
                'successful_trades': self.metrics.successful_trades,
                'failed_trades': self.metrics.failed_trades,
                'last_update': self.metrics.last_update.isoformat()
            },
            'modules': {name: 'healthy' for name in self.modules.keys()},
            'uptime': datetime.now() - self.metrics.last_update if self.metrics.last_update else timedelta()
        }
    
    async def run_backtest(self, strategy_config: Dict[str, Any]) -> Dict[str, Any]:
        """運行回測"""
        self.logger.info("Starting backtest...")
        
        try:
            # 配置回測環境
            backtest_config = self.config.backtest
            
            # 運行回測
            results = await self.modules['backtester'].run_backtest(
                strategy_config=strategy_config,
                start_date=backtest_config.start_date,
                end_date=backtest_config.end_date,
                initial_capital=backtest_config.initial_capital
            )
            
            # 性能分析
            performance_analysis = self.modules['performance_analyzer'].analyze(results)
            
            # Walk-forward分析
            if backtest_config.walk_forward_analysis:
                wf_results = await self.modules['walk_forward'].analyze(strategy_config)
                performance_analysis['walk_forward'] = wf_results
            
            # 過擬合檢測
            overfitting_analysis = self.modules['anti_overfitting'].validate(results)
            performance_analysis['overfitting_analysis'] = overfitting_analysis
            
            self.logger.info("Backtest completed successfully")
            return performance_analysis
            
        except Exception as e:
            self.logger.error(f"Backtest failed: {e}")
            raise
    
    async def wait_for_shutdown(self):
        """等待系統關閉"""
        await self.shutdown_event.wait()


# 全局系統實例
_trading_system: Optional[IntegratedTradingSystem] = None


def get_trading_system(config_path: Optional[str] = None) -> IntegratedTradingSystem:
    """獲取交易系統單例"""
    global _trading_system
    if _trading_system is None:
        _trading_system = IntegratedTradingSystem(config_path)
    return _trading_system


async def main():
    """主程序入口"""
    # 創建交易系統
    trading_system = get_trading_system()
    
    # 添加回調函數示例
    async def on_status_change(status):
        print(f"System status changed to: {status}")
    
    async def on_trade(trade):
        print(f"Trade executed: {trade}")
    
    trading_system.add_callback('on_status_change', on_status_change)
    trading_system.add_callback('on_trade', on_trade)
    
    try:
        # 啟動系統
        if await trading_system.start():
            print("Trading system started successfully")
            print("Press Ctrl+C to stop...")
            
            # 等待關閉
            await trading_system.wait_for_shutdown()
        else:
            print("Failed to start trading system")
            
    except KeyboardInterrupt:
        print("Shutdown requested...")
    except Exception as e:
        print(f"Unexpected error: {e}")
        logging.error(traceback.format_exc())
    finally:
        await trading_system.stop()
        print("Trading system stopped")


if __name__ == "__main__":
    asyncio.run(main())