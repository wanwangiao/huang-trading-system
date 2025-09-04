"""
機器學習模型庫 - 自適應交易系統
提供多種適合金融時序數據的機器學習模型
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Union, Tuple, Any
from abc import ABC, abstractmethod
import logging
import warnings
warnings.filterwarnings('ignore')

# 基礎機器學習庫
from sklearn.base import BaseEstimator, ClassifierMixin, RegressorMixin
from sklearn.ensemble import (
    RandomForestClassifier, RandomForestRegressor,
    VotingClassifier, VotingRegressor,
    BaggingClassifier, BaggingRegressor,
    StackingClassifier, StackingRegressor
)
from sklearn.linear_model import LogisticRegression, LinearRegression, Ridge, Lasso
from sklearn.svm import SVC, SVR
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score

# XGBoost
try:
    import xgboost as xgb
    XGBOOST_AVAILABLE = True
except ImportError:
    XGBOOST_AVAILABLE = False
    logging.warning("XGBoost not installed. XGBoost models will not be available.")

# 深度學習相關
try:
    import tensorflow as tf
    from tensorflow import keras
    from tensorflow.keras import layers, models, optimizers
    from tensorflow.keras.callbacks import EarlyStopping, ModelCheckpoint
    TENSORFLOW_AVAILABLE = True
except ImportError:
    TENSORFLOW_AVAILABLE = False
    logging.warning("TensorFlow not installed. Deep learning models will not be available.")

# 時序分析
try:
    from statsmodels.tsa.arima.model import ARIMA
    from statsmodels.tsa.seasonal import seasonal_decompose
    STATSMODELS_AVAILABLE = True
except ImportError:
    STATSMODELS_AVAILABLE = False
    logging.warning("Statsmodels not installed. ARIMA models will not be available.")

# 強化學習基礎框架
try:
    import gym
    import stable_baselines3 as sb3
    RL_AVAILABLE = True
except ImportError:
    RL_AVAILABLE = False
    logging.warning("Reinforcement learning libraries not available.")


class BaseMLModel(ABC):
    """所有機器學習模型的基類"""
    
    def __init__(self, model_name: str, model_type: str):
        self.model_name = model_name
        self.model_type = model_type
        self.model = None
        self.is_fitted = False
        self.feature_importance = None
        self.training_history = []
        self.logger = logging.getLogger(f"ML_Models.{model_name}")
    
    @abstractmethod
    def fit(self, X: np.ndarray, y: np.ndarray, **kwargs) -> 'BaseMLModel':
        """訓練模型"""
        pass
    
    @abstractmethod
    def predict(self, X: np.ndarray) -> np.ndarray:
        """預測"""
        pass
    
    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        """預測機率（僅適用於分類模型）"""
        if hasattr(self.model, 'predict_proba'):
            return self.model.predict_proba(X)
        else:
            raise NotImplementedError("模型不支援機率預測")
    
    def get_feature_importance(self) -> Optional[np.ndarray]:
        """獲取特徵重要性"""
        return self.feature_importance
    
    def save_model(self, file_path: str):
        """保存模型"""
        import joblib
        joblib.dump(self, file_path)
        self.logger.info(f"模型已保存到: {file_path}")
    
    @classmethod
    def load_model(cls, file_path: str) -> 'BaseMLModel':
        """載入模型"""
        import joblib
        return joblib.load(file_path)


class TraditionalMLModels:
    """傳統機器學習模型集合"""
    
    class RandomForestModel(BaseMLModel):
        """隨機森林模型"""
        
        def __init__(self, task_type: str = 'classification', **kwargs):
            super().__init__("RandomForest", task_type)
            
            if task_type == 'classification':
                self.model = RandomForestClassifier(
                    n_estimators=kwargs.get('n_estimators', 100),
                    max_depth=kwargs.get('max_depth', 10),
                    min_samples_split=kwargs.get('min_samples_split', 5),
                    min_samples_leaf=kwargs.get('min_samples_leaf', 2),
                    random_state=kwargs.get('random_state', 42)
                )
            else:
                self.model = RandomForestRegressor(
                    n_estimators=kwargs.get('n_estimators', 100),
                    max_depth=kwargs.get('max_depth', 10),
                    min_samples_split=kwargs.get('min_samples_split', 5),
                    min_samples_leaf=kwargs.get('min_samples_leaf', 2),
                    random_state=kwargs.get('random_state', 42)
                )
        
        def fit(self, X: np.ndarray, y: np.ndarray, **kwargs) -> 'RandomForestModel':
            self.model.fit(X, y)
            self.feature_importance = self.model.feature_importances_
            self.is_fitted = True
            self.logger.info(f"隨機森林模型訓練完成，特徵數量: {X.shape[1]}")
            return self
        
        def predict(self, X: np.ndarray) -> np.ndarray:
            if not self.is_fitted:
                raise ValueError("模型尚未訓練")
            return self.model.predict(X)
    
    class XGBoostModel(BaseMLModel):
        """XGBoost模型"""
        
        def __init__(self, task_type: str = 'classification', **kwargs):
            if not XGBOOST_AVAILABLE:
                raise ImportError("XGBoost未安裝")
            
            super().__init__("XGBoost", task_type)
            
            if task_type == 'classification':
                self.model = xgb.XGBClassifier(
                    n_estimators=kwargs.get('n_estimators', 100),
                    max_depth=kwargs.get('max_depth', 6),
                    learning_rate=kwargs.get('learning_rate', 0.1),
                    random_state=kwargs.get('random_state', 42),
                    eval_metric='logloss'
                )
            else:
                self.model = xgb.XGBRegressor(
                    n_estimators=kwargs.get('n_estimators', 100),
                    max_depth=kwargs.get('max_depth', 6),
                    learning_rate=kwargs.get('learning_rate', 0.1),
                    random_state=kwargs.get('random_state', 42)
                )
        
        def fit(self, X: np.ndarray, y: np.ndarray, **kwargs) -> 'XGBoostModel':
            # 支援早停和驗證集
            X_val = kwargs.get('X_val', None)
            y_val = kwargs.get('y_val', None)
            
            if X_val is not None and y_val is not None:
                self.model.fit(
                    X, y,
                    eval_set=[(X_val, y_val)],
                    early_stopping_rounds=kwargs.get('early_stopping_rounds', 10),
                    verbose=False
                )
            else:
                self.model.fit(X, y)
            
            self.feature_importance = self.model.feature_importances_
            self.is_fitted = True
            self.logger.info(f"XGBoost模型訓練完成")
            return self
        
        def predict(self, X: np.ndarray) -> np.ndarray:
            if not self.is_fitted:
                raise ValueError("模型尚未訓練")
            return self.model.predict(X)
    
    class SVMModel(BaseMLModel):
        """支援向量機模型"""
        
        def __init__(self, task_type: str = 'classification', **kwargs):
            super().__init__("SVM", task_type)
            
            if task_type == 'classification':
                self.model = SVC(
                    C=kwargs.get('C', 1.0),
                    kernel=kwargs.get('kernel', 'rbf'),
                    probability=True,  # 啟用機率預測
                    random_state=kwargs.get('random_state', 42)
                )
            else:
                self.model = SVR(
                    C=kwargs.get('C', 1.0),
                    kernel=kwargs.get('kernel', 'rbf')
                )
        
        def fit(self, X: np.ndarray, y: np.ndarray, **kwargs) -> 'SVMModel':
            self.model.fit(X, y)
            self.is_fitted = True
            self.logger.info(f"SVM模型訓練完成")
            return self
        
        def predict(self, X: np.ndarray) -> np.ndarray:
            if not self.is_fitted:
                raise ValueError("模型尚未訓練")
            return self.model.predict(X)
    
    class LogisticRegressionModel(BaseMLModel):
        """邏輯回歸模型"""
        
        def __init__(self, **kwargs):
            super().__init__("LogisticRegression", "classification")
            self.model = LogisticRegression(
                C=kwargs.get('C', 1.0),
                solver=kwargs.get('solver', 'liblinear'),
                random_state=kwargs.get('random_state', 42)
            )
        
        def fit(self, X: np.ndarray, y: np.ndarray, **kwargs) -> 'LogisticRegressionModel':
            self.model.fit(X, y)
            self.feature_importance = abs(self.model.coef_[0])
            self.is_fitted = True
            self.logger.info(f"邏輯回歸模型訓練完成")
            return self
        
        def predict(self, X: np.ndarray) -> np.ndarray:
            if not self.is_fitted:
                raise ValueError("模型尚未訓練")
            return self.model.predict(X)


class DeepLearningModels:
    """深度學習模型集合"""
    
    class LSTMModel(BaseMLModel):
        """LSTM時序預測模型"""
        
        def __init__(self, sequence_length: int = 20, **kwargs):
            if not TENSORFLOW_AVAILABLE:
                raise ImportError("TensorFlow未安裝")
            
            super().__init__("LSTM", "time_series")
            self.sequence_length = sequence_length
            self.n_features = kwargs.get('n_features', 1)
            self.lstm_units = kwargs.get('lstm_units', 50)
            self.dropout_rate = kwargs.get('dropout_rate', 0.2)
            self.learning_rate = kwargs.get('learning_rate', 0.001)
            self.build_model()
        
        def build_model(self):
            """構建LSTM模型架構"""
            self.model = models.Sequential([
                layers.LSTM(self.lstm_units, 
                          return_sequences=True, 
                          input_shape=(self.sequence_length, self.n_features)),
                layers.Dropout(self.dropout_rate),
                layers.LSTM(self.lstm_units // 2, return_sequences=False),
                layers.Dropout(self.dropout_rate),
                layers.Dense(25, activation='relu'),
                layers.Dense(1)
            ])
            
            self.model.compile(
                optimizer=optimizers.Adam(learning_rate=self.learning_rate),
                loss='mse',
                metrics=['mae']
            )
        
        def fit(self, X: np.ndarray, y: np.ndarray, **kwargs) -> 'LSTMModel':
            # 準備回調函數
            callbacks = [
                EarlyStopping(patience=10, restore_best_weights=True),
                ModelCheckpoint('best_lstm_model.h5', save_best_only=True)
            ]
            
            # 訓練模型
            history = self.model.fit(
                X, y,
                epochs=kwargs.get('epochs', 100),
                batch_size=kwargs.get('batch_size', 32),
                validation_split=kwargs.get('validation_split', 0.2),
                callbacks=callbacks,
                verbose=kwargs.get('verbose', 0)
            )
            
            self.training_history = history.history
            self.is_fitted = True
            self.logger.info(f"LSTM模型訓練完成")
            return self
        
        def predict(self, X: np.ndarray) -> np.ndarray:
            if not self.is_fitted:
                raise ValueError("模型尚未訓練")
            return self.model.predict(X)
    
    class GRUModel(BaseMLModel):
        """GRU時序預測模型"""
        
        def __init__(self, sequence_length: int = 20, **kwargs):
            if not TENSORFLOW_AVAILABLE:
                raise ImportError("TensorFlow未安裝")
            
            super().__init__("GRU", "time_series")
            self.sequence_length = sequence_length
            self.n_features = kwargs.get('n_features', 1)
            self.gru_units = kwargs.get('gru_units', 50)
            self.dropout_rate = kwargs.get('dropout_rate', 0.2)
            self.learning_rate = kwargs.get('learning_rate', 0.001)
            self.build_model()
        
        def build_model(self):
            """構建GRU模型架構"""
            self.model = models.Sequential([
                layers.GRU(self.gru_units, 
                          return_sequences=True, 
                          input_shape=(self.sequence_length, self.n_features)),
                layers.Dropout(self.dropout_rate),
                layers.GRU(self.gru_units // 2, return_sequences=False),
                layers.Dropout(self.dropout_rate),
                layers.Dense(25, activation='relu'),
                layers.Dense(1)
            ])
            
            self.model.compile(
                optimizer=optimizers.Adam(learning_rate=self.learning_rate),
                loss='mse',
                metrics=['mae']
            )
        
        def fit(self, X: np.ndarray, y: np.ndarray, **kwargs) -> 'GRUModel':
            callbacks = [
                EarlyStopping(patience=10, restore_best_weights=True),
                ModelCheckpoint('best_gru_model.h5', save_best_only=True)
            ]
            
            history = self.model.fit(
                X, y,
                epochs=kwargs.get('epochs', 100),
                batch_size=kwargs.get('batch_size', 32),
                validation_split=kwargs.get('validation_split', 0.2),
                callbacks=callbacks,
                verbose=kwargs.get('verbose', 0)
            )
            
            self.training_history = history.history
            self.is_fitted = True
            self.logger.info(f"GRU模型訓練完成")
            return self
        
        def predict(self, X: np.ndarray) -> np.ndarray:
            if not self.is_fitted:
                raise ValueError("模型尚未訓練")
            return self.model.predict(X)
    
    class TransformerModel(BaseMLModel):
        """Transformer時序預測模型"""
        
        def __init__(self, sequence_length: int = 20, **kwargs):
            if not TENSORFLOW_AVAILABLE:
                raise ImportError("TensorFlow未安裝")
            
            super().__init__("Transformer", "time_series")
            self.sequence_length = sequence_length
            self.n_features = kwargs.get('n_features', 1)
            self.d_model = kwargs.get('d_model', 64)
            self.num_heads = kwargs.get('num_heads', 4)
            self.ff_dim = kwargs.get('ff_dim', 64)
            self.dropout_rate = kwargs.get('dropout_rate', 0.1)
            self.learning_rate = kwargs.get('learning_rate', 0.001)
            self.build_model()
        
        def build_model(self):
            """構建Transformer模型架構"""
            inputs = layers.Input(shape=(self.sequence_length, self.n_features))
            
            # Multi-head attention
            attention_output = layers.MultiHeadAttention(
                num_heads=self.num_heads, 
                key_dim=self.d_model
            )(inputs, inputs)
            attention_output = layers.Dropout(self.dropout_rate)(attention_output)
            attention_output = layers.LayerNormalization()(inputs + attention_output)
            
            # Feed forward network
            ffn_output = layers.Dense(self.ff_dim, activation="relu")(attention_output)
            ffn_output = layers.Dense(self.n_features)(ffn_output)
            ffn_output = layers.Dropout(self.dropout_rate)(ffn_output)
            ffn_output = layers.LayerNormalization()(attention_output + ffn_output)
            
            # Global average pooling and final dense layers
            outputs = layers.GlobalAveragePooling1D()(ffn_output)
            outputs = layers.Dense(50, activation="relu")(outputs)
            outputs = layers.Dropout(self.dropout_rate)(outputs)
            outputs = layers.Dense(1)(outputs)
            
            self.model = models.Model(inputs=inputs, outputs=outputs)
            self.model.compile(
                optimizer=optimizers.Adam(learning_rate=self.learning_rate),
                loss='mse',
                metrics=['mae']
            )
        
        def fit(self, X: np.ndarray, y: np.ndarray, **kwargs) -> 'TransformerModel':
            callbacks = [
                EarlyStopping(patience=15, restore_best_weights=True),
                ModelCheckpoint('best_transformer_model.h5', save_best_only=True)
            ]
            
            history = self.model.fit(
                X, y,
                epochs=kwargs.get('epochs', 100),
                batch_size=kwargs.get('batch_size', 32),
                validation_split=kwargs.get('validation_split', 0.2),
                callbacks=callbacks,
                verbose=kwargs.get('verbose', 0)
            )
            
            self.training_history = history.history
            self.is_fitted = True
            self.logger.info(f"Transformer模型訓練完成")
            return self
        
        def predict(self, X: np.ndarray) -> np.ndarray:
            if not self.is_fitted:
                raise ValueError("模型尚未訓練")
            return self.model.predict(X)


class TimeSeriesModels:
    """時序專用模型"""
    
    class ARIMAModel(BaseMLModel):
        """ARIMA時序模型"""
        
        def __init__(self, order: Tuple[int, int, int] = (1, 1, 1)):
            if not STATSMODELS_AVAILABLE:
                raise ImportError("Statsmodels未安裝")
            
            super().__init__("ARIMA", "time_series")
            self.order = order
        
        def fit(self, X: np.ndarray, y: np.ndarray = None, **kwargs) -> 'ARIMAModel':
            # ARIMA使用時間序列數據
            if y is None:
                data = X.flatten()
            else:
                data = y
            
            self.model = ARIMA(data, order=self.order)
            self.fitted_model = self.model.fit()
            self.is_fitted = True
            self.logger.info(f"ARIMA{self.order}模型訓練完成")
            return self
        
        def predict(self, steps: int = 1) -> np.ndarray:
            if not self.is_fitted:
                raise ValueError("模型尚未訓練")
            return self.fitted_model.forecast(steps=steps)
        
        def predict_with_confidence(self, steps: int = 1) -> Tuple[np.ndarray, np.ndarray]:
            """預測並返回置信區間"""
            if not self.is_fitted:
                raise ValueError("模型尚未訓練")
            forecast = self.fitted_model.get_forecast(steps=steps)
            return forecast.predicted_mean.values, forecast.conf_int().values


class EnsembleModels:
    """集成模型"""
    
    class VotingEnsemble(BaseMLModel):
        """投票集成模型"""
        
        def __init__(self, models: List[BaseMLModel], task_type: str = 'classification', **kwargs):
            super().__init__("VotingEnsemble", task_type)
            self.base_models = models
            self.voting_type = kwargs.get('voting', 'soft' if task_type == 'classification' else None)
            
            # 準備sklearn模型列表
            estimators = [(model.model_name, model.model) for model in models]
            
            if task_type == 'classification':
                self.model = VotingClassifier(
                    estimators=estimators,
                    voting=self.voting_type
                )
            else:
                self.model = VotingRegressor(estimators=estimators)
        
        def fit(self, X: np.ndarray, y: np.ndarray, **kwargs) -> 'VotingEnsemble':
            self.model.fit(X, y)
            self.is_fitted = True
            self.logger.info(f"投票集成模型訓練完成，包含 {len(self.base_models)} 個基模型")
            return self
        
        def predict(self, X: np.ndarray) -> np.ndarray:
            if not self.is_fitted:
                raise ValueError("模型尚未訓練")
            return self.model.predict(X)
    
    class StackingEnsemble(BaseMLModel):
        """堆疊集成模型"""
        
        def __init__(self, base_models: List[BaseMLModel], meta_model: BaseMLModel, 
                     task_type: str = 'classification', **kwargs):
            super().__init__("StackingEnsemble", task_type)
            self.base_models = base_models
            self.meta_model = meta_model
            
            # 準備sklearn模型列表
            estimators = [(model.model_name, model.model) for model in base_models]
            
            if task_type == 'classification':
                self.model = StackingClassifier(
                    estimators=estimators,
                    final_estimator=meta_model.model,
                    cv=kwargs.get('cv', 5)
                )
            else:
                self.model = StackingRegressor(
                    estimators=estimators,
                    final_estimator=meta_model.model,
                    cv=kwargs.get('cv', 5)
                )
        
        def fit(self, X: np.ndarray, y: np.ndarray, **kwargs) -> 'StackingEnsemble':
            self.model.fit(X, y)
            self.is_fitted = True
            self.logger.info(f"堆疊集成模型訓練完成")
            return self
        
        def predict(self, X: np.ndarray) -> np.ndarray:
            if not self.is_fitted:
                raise ValueError("模型尚未訓練")
            return self.model.predict(X)
    
    class BaggingEnsemble(BaseMLModel):
        """Bagging集成模型"""
        
        def __init__(self, base_model: BaseMLModel, task_type: str = 'classification', **kwargs):
            super().__init__("BaggingEnsemble", task_type)
            self.base_model = base_model
            
            if task_type == 'classification':
                self.model = BaggingClassifier(
                    base_estimator=base_model.model,
                    n_estimators=kwargs.get('n_estimators', 10),
                    random_state=kwargs.get('random_state', 42)
                )
            else:
                self.model = BaggingRegressor(
                    base_estimator=base_model.model,
                    n_estimators=kwargs.get('n_estimators', 10),
                    random_state=kwargs.get('random_state', 42)
                )
        
        def fit(self, X: np.ndarray, y: np.ndarray, **kwargs) -> 'BaggingEnsemble':
            self.model.fit(X, y)
            self.is_fitted = True
            self.logger.info(f"Bagging集成模型訓練完成")
            return self
        
        def predict(self, X: np.ndarray) -> np.ndarray:
            if not self.is_fitted:
                raise ValueError("模型尚未訓練")
            return self.model.predict(X)


class ReinforcementLearningModels:
    """強化學習模型基礎框架"""
    
    class TradingEnvironment:
        """交易環境基類"""
        
        def __init__(self, price_data: pd.DataFrame, initial_balance: float = 10000):
            self.price_data = price_data
            self.initial_balance = initial_balance
            self.reset()
        
        def reset(self):
            """重置環境"""
            self.current_step = 0
            self.balance = self.initial_balance
            self.position = 0
            self.total_profit = 0
            return self._get_observation()
        
        def _get_observation(self):
            """獲取當前狀態觀察"""
            if self.current_step >= len(self.price_data):
                return None
            
            # 返回當前價格信息和持倉狀態
            current_price = self.price_data.iloc[self.current_step]
            return np.array([
                current_price['open'],
                current_price['high'],
                current_price['low'],
                current_price['close'],
                current_price['volume'],
                self.position,
                self.balance
            ])
        
        def step(self, action: int):
            """執行動作並返回新狀態、獎勵、是否結束"""
            if self.current_step >= len(self.price_data) - 1:
                return None, 0, True, {}
            
            current_price = self.price_data.iloc[self.current_step]['close']
            next_price = self.price_data.iloc[self.current_step + 1]['close']
            
            # 動作：0=持有, 1=買入, 2=賣出
            reward = 0
            
            if action == 1 and self.position == 0:  # 買入
                self.position = self.balance / current_price
                self.balance = 0
            elif action == 2 and self.position > 0:  # 賣出
                self.balance = self.position * current_price
                profit = self.balance - self.initial_balance
                reward = profit
                self.total_profit += profit
                self.position = 0
            
            self.current_step += 1
            next_obs = self._get_observation()
            done = self.current_step >= len(self.price_data) - 1
            
            return next_obs, reward, done, {}
    
    class QLearningTrader(BaseMLModel):
        """Q-Learning交易代理"""
        
        def __init__(self, state_size: int = 7, action_size: int = 3, **kwargs):
            super().__init__("Q-Learning", "reinforcement_learning")
            self.state_size = state_size
            self.action_size = action_size
            self.learning_rate = kwargs.get('learning_rate', 0.01)
            self.discount_factor = kwargs.get('discount_factor', 0.95)
            self.epsilon = kwargs.get('epsilon', 1.0)
            self.epsilon_decay = kwargs.get('epsilon_decay', 0.995)
            self.epsilon_min = kwargs.get('epsilon_min', 0.01)
            
            # 初始化Q表
            self.q_table = {}
        
        def _get_state_key(self, state: np.ndarray) -> str:
            """將狀態轉換為字符串鍵值"""
            return str(np.round(state, 2))
        
        def choose_action(self, state: np.ndarray) -> int:
            """選擇動作（epsilon-greedy策略）"""
            if np.random.random() <= self.epsilon:
                return np.random.choice(self.action_size)
            
            state_key = self._get_state_key(state)
            if state_key not in self.q_table:
                self.q_table[state_key] = np.zeros(self.action_size)
            
            return np.argmax(self.q_table[state_key])
        
        def learn(self, state: np.ndarray, action: int, reward: float, 
                 next_state: np.ndarray, done: bool):
            """Q-Learning學習更新"""
            state_key = self._get_state_key(state)
            next_state_key = self._get_state_key(next_state) if next_state is not None else None
            
            if state_key not in self.q_table:
                self.q_table[state_key] = np.zeros(self.action_size)
            if next_state_key and next_state_key not in self.q_table:
                self.q_table[next_state_key] = np.zeros(self.action_size)
            
            if done or next_state is None:
                target = reward
            else:
                target = reward + self.discount_factor * np.max(self.q_table[next_state_key])
            
            self.q_table[state_key][action] += self.learning_rate * (
                target - self.q_table[state_key][action]
            )
            
            if self.epsilon > self.epsilon_min:
                self.epsilon *= self.epsilon_decay
        
        def fit(self, X: pd.DataFrame, y: np.ndarray = None, **kwargs) -> 'QLearningTrader':
            """訓練Q-Learning代理"""
            episodes = kwargs.get('episodes', 1000)
            env = TradingEnvironment(X)
            
            for episode in range(episodes):
                state = env.reset()
                total_reward = 0
                
                while True:
                    if state is None:
                        break
                    
                    action = self.choose_action(state)
                    next_state, reward, done, _ = env.step(action)
                    
                    self.learn(state, action, reward, next_state, done)
                    state = next_state
                    total_reward += reward
                    
                    if done:
                        break
                
                if episode % 100 == 0:
                    self.logger.info(f"Episode {episode}, Total Reward: {total_reward:.2f}, Epsilon: {self.epsilon:.3f}")
            
            self.is_fitted = True
            return self
        
        def predict(self, X: np.ndarray) -> np.ndarray:
            """預測動作"""
            if not self.is_fitted:
                raise ValueError("模型尚未訓練")
            
            actions = []
            for state in X:
                action = self.choose_action(state)
                actions.append(action)
            return np.array(actions)


class ModelFactory:
    """模型工廠類"""
    
    @staticmethod
    def create_model(model_name: str, model_type: str = 'classification', **kwargs) -> BaseMLModel:
        """創建指定的模型實例"""
        
        if model_name.lower() == 'randomforest':
            return TraditionalMLModels.RandomForestModel(task_type=model_type, **kwargs)
        
        elif model_name.lower() == 'xgboost':
            return TraditionalMLModels.XGBoostModel(task_type=model_type, **kwargs)
        
        elif model_name.lower() == 'svm':
            return TraditionalMLModels.SVMModel(task_type=model_type, **kwargs)
        
        elif model_name.lower() == 'logisticregression':
            return TraditionalMLModels.LogisticRegressionModel(**kwargs)
        
        elif model_name.lower() == 'lstm':
            return DeepLearningModels.LSTMModel(**kwargs)
        
        elif model_name.lower() == 'gru':
            return DeepLearningModels.GRUModel(**kwargs)
        
        elif model_name.lower() == 'transformer':
            return DeepLearningModels.TransformerModel(**kwargs)
        
        elif model_name.lower() == 'arima':
            return TimeSeriesModels.ARIMAModel(**kwargs)
        
        elif model_name.lower() == 'qlearning':
            return ReinforcementLearningModels.QLearningTrader(**kwargs)
        
        else:
            raise ValueError(f"未知的模型類型: {model_name}")
    
    @staticmethod
    def create_ensemble(ensemble_type: str, base_models: List[BaseMLModel], 
                       task_type: str = 'classification', **kwargs) -> BaseMLModel:
        """創建集成模型"""
        
        if ensemble_type.lower() == 'voting':
            return EnsembleModels.VotingEnsemble(base_models, task_type, **kwargs)
        
        elif ensemble_type.lower() == 'stacking':
            meta_model = kwargs.pop('meta_model', None)
            if meta_model is None:
                meta_model = TraditionalMLModels.LogisticRegressionModel()
            return EnsembleModels.StackingEnsemble(base_models, meta_model, task_type, **kwargs)
        
        elif ensemble_type.lower() == 'bagging':
            base_model = base_models[0] if base_models else TraditionalMLModels.RandomForestModel()
            return EnsembleModels.BaggingEnsemble(base_model, task_type, **kwargs)
        
        else:
            raise ValueError(f"未知的集成類型: {ensemble_type}")


# 使用示例
if __name__ == "__main__":
    # 配置日誌
    logging.basicConfig(level=logging.INFO)
    
    # 創建示例數據
    np.random.seed(42)
    X_sample = np.random.randn(1000, 10)
    y_sample = np.random.randint(0, 2, 1000)
    
    # 測試傳統ML模型
    print("=== 測試傳統機器學習模型 ===")
    
    # 隨機森林
    rf_model = ModelFactory.create_model('randomforest', 'classification')
    rf_model.fit(X_sample, y_sample)
    rf_predictions = rf_model.predict(X_sample[:10])
    print(f"隨機森林預測結果: {rf_predictions}")
    
    # XGBoost（如果可用）
    if XGBOOST_AVAILABLE:
        xgb_model = ModelFactory.create_model('xgboost', 'classification')
        xgb_model.fit(X_sample, y_sample)
        xgb_predictions = xgb_model.predict(X_sample[:10])
        print(f"XGBoost預測結果: {xgb_predictions}")
    
    # 測試集成模型
    print("\n=== 測試集成模型 ===")
    base_models = [
        ModelFactory.create_model('randomforest', 'classification'),
        ModelFactory.create_model('svm', 'classification'),
        ModelFactory.create_model('logisticregression')
    ]
    
    # 訓練基模型
    for model in base_models:
        model.fit(X_sample, y_sample)
    
    # 投票集成
    voting_model = ModelFactory.create_ensemble('voting', base_models, 'classification')
    voting_model.fit(X_sample, y_sample)
    voting_predictions = voting_model.predict(X_sample[:10])
    print(f"投票集成預測結果: {voting_predictions}")
    
    # 測試深度學習模型（如果可用）
    if TENSORFLOW_AVAILABLE:
        print("\n=== 測試深度學習模型 ===")
        # 準備時序數據
        sequence_length = 20
        X_ts = np.random.randn(100, sequence_length, 1)
        y_ts = np.random.randn(100, 1)
        
        lstm_model = ModelFactory.create_model('lstm', sequence_length=sequence_length, n_features=1)
        lstm_model.fit(X_ts, y_ts, epochs=5, verbose=0)
        lstm_predictions = lstm_model.predict(X_ts[:5])
        print(f"LSTM預測結果: {lstm_predictions.flatten()}")
    
    print("\n=== 模型庫測試完成 ===")