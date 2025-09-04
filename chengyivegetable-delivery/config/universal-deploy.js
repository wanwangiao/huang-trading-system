#!/usr/bin/env node
/**
 * 🌍 通用智能部署系統
 * 自動識別任何專案並執行安全部署
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 專案自動檢測函數
function detectProject() {
  console.log('🔍 自動檢測當前專案...\n');
  
  const projectInfo = {
    directory: path.basename(process.cwd()),
    fullPath: process.cwd(),
    packageInfo: null,
    gitInfo: null,
    vercelInfo: null,
    deploymentType: 'unknown'
  };
  
  // 1. 讀取 package.json
  const packagePath = path.join(process.cwd(), 'package.json');
  if (fs.existsSync(packagePath)) {
    try {
      projectInfo.packageInfo = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      console.log(`📦 專案名稱: ${projectInfo.packageInfo.name}`);
      console.log(`📋 專案描述: ${projectInfo.packageInfo.description || '無描述'}`);
    } catch (error) {
      console.log('⚠️ package.json 讀取失敗');
    }
  }
  
  // 2. 檢測 Git 資訊
  try {
    const gitRemote = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
    const gitBranch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    projectInfo.gitInfo = { remote: gitRemote, branch: gitBranch };
    console.log(`🔗 Git 倉庫: ${gitRemote}`);
    console.log(`🌿 當前分支: ${gitBranch}`);
  } catch (error) {
    console.log('⚠️ 無法讀取 Git 資訊');
  }
  
  // 3. 檢測部署平台
  if (fs.existsSync(path.join(process.cwd(), '.vercel'))) {
    projectInfo.deploymentType = 'vercel';
    
    const vercelConfigPath = path.join(process.cwd(), '.vercel', 'project.json');
    if (fs.existsSync(vercelConfigPath)) {
      try {
        projectInfo.vercelInfo = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8'));
        console.log(`🌐 Vercel 專案: ${projectInfo.vercelInfo.projectName}`);
      } catch (error) {
        console.log('⚠️ Vercel 配置讀取失敗');
      }
    }
  } else if (fs.existsSync(path.join(process.cwd(), '.netlify'))) {
    projectInfo.deploymentType = 'netlify';
    console.log('🌐 檢測到 Netlify 部署');
  } else if (fs.existsSync(path.join(process.cwd(), 'Dockerfile'))) {
    projectInfo.deploymentType = 'docker';
    console.log('🐳 檢測到 Docker 部署');
  } else {
    console.log('❓ 未檢測到部署平台配置');
  }
  
  return projectInfo;
}

// 智能部署策略選擇
function selectDeploymentStrategy(projectInfo) {
  console.log('\n🎯 選擇部署策略...');
  
  if (projectInfo.deploymentType === 'vercel') {
    console.log('📡 使用 Vercel 部署策略');
    return 'vercel';
  } else if (projectInfo.deploymentType === 'netlify') {
    console.log('📡 使用 Netlify 部署策略');
    return 'netlify';
  } else if (projectInfo.deploymentType === 'docker') {
    console.log('🐳 使用 Docker 部署策略');
    return 'docker';
  } else {
    console.log('📡 使用通用 Git 推送策略');
    return 'git';
  }
}

// 通用進度記錄更新
function updateProjectProgress(projectInfo) {
  const timestamp = new Date().toLocaleString('zh-TW');
  
  // 查找可能的進度記錄檔案
  const possibleFiles = ['CLAUDE.md', 'README.md', 'PROGRESS.md', 'CHANGELOG.md'];
  
  for (const fileName of possibleFiles) {
    const filePath = path.join(process.cwd(), fileName);
    if (fs.existsSync(filePath)) {
      try {
        let content = fs.readFileSync(filePath, 'utf8');
        
        // 更新時間戳
        const updateLine = `*最後更新: ${timestamp}*`;
        
        if (content.includes('最後更新:')) {
          content = content.replace(/\*最後更新:.*?\*/g, updateLine);
        } else {
          // 添加新的更新記錄
          const newSection = `\n\n---\n${updateLine}\n*狀態: 通用智能部署系統自動更新*\n*專案: ${projectInfo.packageInfo?.name || projectInfo.directory}*\n`;
          content += newSection;
        }
        
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`📋 已更新進度記錄: ${fileName}`);
        return fileName;
      } catch (error) {
        console.log(`⚠️ 更新 ${fileName} 時出錯:`, error.message);
      }
    }
  }
  
  // 如果沒有找到現有檔案，創建新的
  const newProgressFile = 'DEPLOYMENT_LOG.md';
  const content = `# 部署記錄\n\n## 專案資訊\n- **名稱**: ${projectInfo.packageInfo?.name || projectInfo.directory}\n- **描述**: ${projectInfo.packageInfo?.description || '無描述'}\n- **部署平台**: ${projectInfo.deploymentType}\n\n---\n*最後更新: ${timestamp}*\n*狀態: 通用智能部署系統自動創建*\n`;
  
  fs.writeFileSync(path.join(process.cwd(), newProgressFile), content, 'utf8');
  console.log(`📋 已創建新的進度記錄: ${newProgressFile}`);
  return newProgressFile;
}

// 執行部署策略
async function executeDeployment(strategy, projectInfo) {
  console.log(`\n🚀 執行 ${strategy.toUpperCase()} 部署...\n`);
  
  try {
    // 1. 添加所有更改
    console.log('1️⃣ 添加所有更改...');
    execSync('git add .', { stdio: 'inherit' });
    
    // 2. 檢查是否有更改需要提交
    const status = execSync('git status --porcelain', { encoding: 'utf8' });
    
    if (status.trim()) {
      const commitMessage = `🤖 通用部署系統自動更新 - ${new Date().toLocaleString('zh-TW')}`;
      console.log('2️⃣ 提交更改...');
      execSync(`git commit -m "${commitMessage}"`, { stdio: 'inherit' });
    } else {
      console.log('2️⃣ 沒有新更改需要提交');
    }
    
    // 3. 推送到遠端
    console.log('3️⃣ 推送到遠端...');
    execSync('git push', { stdio: 'inherit' });
    
    // 4. 根據策略執行部署
    switch (strategy) {
      case 'vercel':
        console.log('4️⃣ 部署到 Vercel...');
        execSync('vercel --prod', { stdio: 'inherit' });
        
        if (projectInfo.vercelInfo?.projectName) {
          console.log(`🌐 Vercel 專案: https://${projectInfo.vercelInfo.projectName}.vercel.app`);
        }
        break;
        
      case 'netlify':
        console.log('4️⃣ 部署到 Netlify...');
        try {
          execSync('netlify deploy --prod', { stdio: 'inherit' });
        } catch (error) {
          console.log('💡 如果沒有 netlify-cli，請先安裝: npm install -g netlify-cli');
          throw error;
        }
        break;
        
      case 'docker':
        console.log('4️⃣ 執行 Docker 部署...');
        execSync('docker build -t current-project .', { stdio: 'inherit' });
        console.log('🐳 Docker 映像已建立，請手動部署到您的容器平台');
        break;
        
      case 'git':
        console.log('4️⃣ Git 推送完成');
        console.log('💡 程式碼已推送，請根據您的部署平台手動觸發部署');
        break;
    }
    
    return true;
    
  } catch (error) {
    console.error(`❌ ${strategy} 部署失敗:`, error.message);
    return false;
  }
}

// 主要通用部署函數
async function universalDeploy() {
  console.log('🌍 通用智能部署系統啟動...\n');
  
  try {
    // 1. 自動檢測專案
    const projectInfo = detectProject();
    
    // 2. 更新進度記錄
    console.log('\n📝 更新專案進度記錄...');
    updateProjectProgress(projectInfo);
    
    // 3. 選擇部署策略
    const strategy = selectDeploymentStrategy(projectInfo);
    
    // 4. 顯示部署資訊
    console.log('\n📋 部署資訊確認:');
    console.log(`   專案: ${projectInfo.packageInfo?.name || projectInfo.directory}`);
    console.log(`   目錄: ${projectInfo.directory}`);
    console.log(`   策略: ${strategy.toUpperCase()}`);
    
    // 5. 執行部署
    const success = await executeDeployment(strategy, projectInfo);
    
    if (success) {
      console.log('\n✅ 通用智能部署完成！');
      console.log(`🎯 專案: ${projectInfo.packageInfo?.name || projectInfo.directory}`);
      console.log('🤖 下次在任何專案中說"請更新進度記錄並推送部署"都會自動識別並部署！');
    } else {
      console.log('\n❌ 部署過程中發生錯誤');
    }
    
  } catch (error) {
    console.error('💥 通用部署系統發生錯誤:', error.message);
    console.log('\n🛠️ 建議檢查:');
    console.log('   1. 確認在正確的專案目錄中');
    console.log('   2. 確認 Git 倉庫已初始化');
    console.log('   3. 確認有 package.json 檔案');
    process.exit(1);
  }
}

// 如果直接執行此腳本
if (require.main === module) {
  universalDeploy();
}

module.exports = { universalDeploy, detectProject };