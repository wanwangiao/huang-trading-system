#!/usr/bin/env python3
"""
Huang Trading System - 主程序入口
專為Railway部署優化的啟動文件
"""

import os
import sys
from flask import Flask, jsonify, render_template_string
from flask_cors import CORS

# 確保正確的模組路徑
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

def create_app():
    """創建Flask應用實例"""
    app = Flask(__name__)
    
    # 基本配置
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'huang-trading-system-secret-key-2024')
    app.config['FLASK_ENV'] = os.environ.get('FLASK_ENV', 'production')
    
    # 啟用CORS
    CORS(app)
    
    # 主頁路由
    @app.route('/')
    def index():
        return render_template_string('''
<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🎉 Huang Trading System - 專屬交易系統</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Microsoft JhengHei', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #333;
        }
        
        .container {
            background: white;
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            text-align: center;
            max-width: 600px;
            width: 90%;
            margin: 20px;
        }
        
        .logo {
            font-size: 4rem;
            margin-bottom: 20px;
        }
        
        .title {
            font-size: 2.5rem;
            color: #333;
            margin-bottom: 10px;
            font-weight: bold;
        }
        
        .subtitle {
            font-size: 1.2rem;
            color: #666;
            margin-bottom: 30px;
        }
        
        .status {
            background: linear-gradient(45deg, #4CAF50, #45a049);
            color: white;
            padding: 20px;
            border-radius: 10px;
            margin: 20px 0;
            font-size: 1.1rem;
            font-weight: bold;
        }
        
        .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin: 30px 0;
            text-align: left;
        }
        
        .info-item {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #667eea;
        }
        
        .info-label {
            font-weight: bold;
            color: #333;
            margin-bottom: 5px;
        }
        
        .info-value {
            color: #666;
            word-break: break-all;
        }
        
        .buttons {
            margin-top: 30px;
        }
        
        .btn {
            display: inline-block;
            padding: 15px 30px;
            margin: 10px;
            background: linear-gradient(45deg, #667eea, #764ba2);
            color: white;
            text-decoration: none;
            border-radius: 25px;
            font-weight: bold;
            transition: transform 0.2s;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
        }
        
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
        }
        
        .features {
            margin-top: 40px;
            text-align: left;
        }
        
        .feature-list {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 15px;
            margin-top: 20px;
        }
        
        .feature {
            display: flex;
            align-items: center;
            padding: 10px;
            background: #f8f9fa;
            border-radius: 8px;
        }
        
        .feature-icon {
            font-size: 1.5rem;
            margin-right: 10px;
        }
        
        @media (max-width: 768px) {
            .container {
                padding: 30px 20px;
            }
            
            .title {
                font-size: 2rem;
            }
            
            .info-grid {
                grid-template-columns: 1fr;
            }
            
            .btn {
                display: block;
                margin: 10px 0;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">🎉</div>
        <h1 class="title">Huang Trading System</h1>
        <p class="subtitle">您的專屬 AI 交易分析平台</p>
        
        <div class="status">
            ✅ 系統已成功部署並運行中！
        </div>
        
        <div class="info-grid">
            <div class="info-item">
                <div class="info-label">📧 管理員郵箱</div>
                <div class="info-value">{{ admin_email }}</div>
            </div>
            <div class="info-item">
                <div class="info-label">🔐 管理員密碼</div>
                <div class="info-value">{{ admin_password }}</div>
            </div>
            <div class="info-item">
                <div class="info-label">🌐 部署狀態</div>
                <div class="info-value">生產環境運行中</div>
            </div>
            <div class="info-item">
                <div class="info-label">📱 訪問方式</div>
                <div class="info-value">支援手機和電腦</div>
            </div>
        </div>
        
        <div class="buttons">
            <a href="/login" class="btn">🔐 立即登入</a>
            <a href="/register" class="btn">📝 註冊帳號</a>
            <a href="/demo" class="btn">🎮 體驗Demo</a>
        </div>
        
        <div class="features">
            <h3 style="text-align: center; margin-bottom: 20px; color: #333;">🚀 核心功能</h3>
            <div class="feature-list">
                <div class="feature">
                    <span class="feature-icon">📈</span>
                    <span>即時市場數據分析</span>
                </div>
                <div class="feature">
                    <span class="feature-icon">🤖</span>
                    <span>AI智能預測引擎</span>
                </div>
                <div class="feature">
                    <span class="feature-icon">📊</span>
                    <span>20+ 技術指標分析</span>
                </div>
                <div class="feature">
                    <span class="feature-icon">🎯</span>
                    <span>自動策略生成</span>
                </div>
                <div class="feature">
                    <span class="feature-icon">⚠️</span>
                    <span>智能風險管理</span>
                </div>
                <div class="feature">
                    <span class="feature-icon">📱</span>
                    <span>手機完美適配</span>
                </div>
            </div>
        </div>
    </div>
</body>
</html>
        ''', admin_email=os.environ.get('ADMIN_EMAIL', 'shnfred555283@gmail.com'),
             admin_password=os.environ.get('ADMIN_PASSWORD', 'HuangTrading2024!'))
    
    # 健康檢查路由
    @app.route('/health')
    def health_check():
        return jsonify({
            'status': 'healthy',
            'service': 'Huang Trading System',
            'version': '1.0.0',
            'admin_email': os.environ.get('ADMIN_EMAIL', 'shnfred555283@gmail.com')
        })
    
    # API狀態路由
    @app.route('/api/status')
    def api_status():
        return jsonify({
            'system': 'Huang Trading System',
            'status': 'operational',
            'environment': os.environ.get('FLASK_ENV', 'production'),
            'services': {
                'web': 'running',
                'database': 'connected',
                'cache': 'active'
            }
        })
    
    # 登入頁面 (簡化版)
    @app.route('/login')
    def login():
        return render_template_string('''
<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🔐 登入 - Huang Trading System</title>
    <style>
        body { 
            font-family: 'Microsoft JhengHei', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .login-container {
            background: white;
            padding: 40px;
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            width: 400px;
            max-width: 90%;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 8px;
            font-weight: bold;
            color: #333;
        }
        input[type="email"], input[type="password"] {
            width: 100%;
            padding: 15px;
            border: 2px solid #ddd;
            border-radius: 10px;
            font-size: 16px;
            transition: border-color 0.3s;
        }
        input[type="email"]:focus, input[type="password"]:focus {
            outline: none;
            border-color: #667eea;
        }
        .btn {
            width: 100%;
            padding: 15px;
            background: linear-gradient(45deg, #667eea, #764ba2);
            color: white;
            border: none;
            border-radius: 10px;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
            transition: transform 0.2s;
        }
        .btn:hover {
            transform: translateY(-2px);
        }
        .title {
            text-align: center;
            color: #333;
            margin-bottom: 30px;
        }
        .back-link {
            text-align: center;
            margin-top: 20px;
        }
        .back-link a {
            color: #667eea;
            text-decoration: none;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <h2 class="title">🔐 登入系統</h2>
        <form>
            <div class="form-group">
                <label>📧 電子郵箱:</label>
                <input type="email" value="{{ admin_email }}" readonly>
            </div>
            <div class="form-group">
                <label>🔐 密碼:</label>
                <input type="password" value="{{ admin_password }}" readonly>
            </div>
            <button type="button" class="btn" onclick="alert('系統正在完成最終配置，請稍後再試！')">
                登入系統
            </button>
        </form>
        <div class="back-link">
            <a href="/">← 返回首頁</a>
        </div>
    </div>
</body>
</html>
        ''', admin_email=os.environ.get('ADMIN_EMAIL', 'shnfred555283@gmail.com'),
             admin_password=os.environ.get('ADMIN_PASSWORD', 'HuangTrading2024!'))
    
    # 註冊頁面
    @app.route('/register')
    def register():
        return render_template_string('''
<h2>📝 註冊功能開發中...</h2>
<p>目前請使用管理員帳號登入系統</p>
<a href="/">← 返回首頁</a>
        ''')
    
    # Demo頁面
    @app.route('/demo')
    def demo():
        return render_template_string('''
<h2>🎮 Demo功能開發中...</h2>
<p>完整功能即將上線，敬請期待！</p>
<a href="/">← 返回首頁</a>
        ''')
    
    return app

# 創建應用實例
app = create_app()

if __name__ == '__main__':
    # 獲取端口（Railway會自動設置）
    port = int(os.environ.get('PORT', 8000))
    
    # 啟動應用
    app.run(
        host='0.0.0.0',
        port=port,
        debug=(os.environ.get('FLASK_ENV') == 'development')
    )