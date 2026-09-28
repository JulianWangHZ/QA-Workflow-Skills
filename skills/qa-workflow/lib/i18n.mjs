// 報告與用例審閱頁的顯示文字。CLI 訊息固定使用繁體中文。
const DICT = {
  'zh-TW': {
    reportTitle: 'QA 驗收報告',
    verdict: { go: '可發布', conditional: '有條件可發布', 'no-go': '不可發布', incomplete: '未完成' },
    status: {
      passed: '通過', failed: '失敗', blocked: '阻塞', skipped: '跳過', 'not-run': '未執行', infeasible: '無法自動化',
      manual: '手動', uncovered: '未覆蓋'
    },
    classification: {
      'test-defect': '測試缺陷', 'product-defect': '產品缺陷', environment: '環境問題', 'unclear-requirement': '需求不明'
    },
    section: {
      scope: '範圍', stats: '統計', reasons: '結論依據', risks: '風險', cases: '用例', failures: '失敗與阻塞',
      review: '代碼審查', timeline: '流程紀錄', techniques: '測試設計技法', transitions: '狀態轉換',
      rules: '業務規則', deferred: '延後處理的風險', questions: '待釐清問題', selfReview: '用例自審'
    },
    col: {
      id: 'ID', title: '標題', level: '等級', priority: '優先級', type: '類型', risks: '風險',
      result: '結果', cases: '用例', impact: '影響', technique: '技法', applicable: '適用', note: '對應用例 / 理由',
      from: '起點', to: '終點', trigger: '觸發', valid: '合法', severity: '嚴重度',
      file: '位置', classification: '分類', reason: '說明', stage: '階段', action: '動作', at: '時間',
      steps: '步驟', expected: '預期結果', preconditions: '前置條件', conditions: '條件', outcome: '結果'
    },
    technique: {
      equivalence: '等價類劃分', boundary: '邊界值分析', 'decision-table': '決策表', path: '正向／負向／例外路徑',
      'state-transition': '狀態轉換', 'role-permission': '角色與權限', 'data-lifecycle': '資料生命週期',
      pairwise: '成對組合', 'error-guessing': '錯誤猜測', concurrency: '併發與重複操作',
      'dependency-failure': '外部依賴失效', environment: '環境與設定差異'
    },
    type: {
      positive: '正向', negative: '負向', boundary: '邊界', error: '例外', permission: '權限', state: '狀態',
      concurrency: '併發', integration: '整合', ui: '介面', performance: '效能', security: '安全', regression: '回歸'
    },
    reviewLabels: {
      checks: '確定性檢查', score: '評分', dimension: '維度', points: '分數', strengths: '優點', findings: '問題', suggestions: '建議',
      dims: { fidelity: '情境忠實度', reliability: '測試可信度', style: 'Coding style', productRisk: '產品風險', maintainability: '可維護性' }
    },
    review: {
      kicker: '用例審閱', pending: '待確認', confirmed: '已確認', stale: '確認後有修改，需重新確認',
      statusTip: {
        pending: '還沒有人確認這批情境。確認後才會開始寫自動化測試。',
        confirmed: '這批情境已確認，內容已鎖定。',
        stale: '確認之後，情境、矩陣、狀態機或原型又被修改過，所以先前的確認不再有效。請重新審閱並再次確認，後續步驟才能繼續。'
      },
      tabs: { overview: '產生方式', matrix: '測試矩陣', state: '狀態機', prototype: '互動原型', acceptance: '驗收清單', bdd: 'BDD Feature' },
      intro: {
        overview: '完整流程共 8 個階段，下圖標出每個階段的產出與目前進度。用例設計的展開方式列在它下方：先用測試矩陣、狀態機與互動原型系統化展開，再寫成 BDD 情境，最後交給獨立評審打分。',
        matrix: '每一列是一個要驗證的條件組合。有對應情境的列會標出情境編號；不測的列必須寫明理由。',
        state: '功能中的狀態與轉換。允許的轉換都要有情境走過；系統必須阻擋的轉換也要有負向情境驗證。',
        prototype: '在左側點選情境，右側會自動示範該情境的操作與結果；也可以直接在畫面上點擊、輸入，自由走一遍流程。',
        acceptance: '每個情境一段：前置條件、操作、預期結果。逐條核對後打勾，勾選只存在你的瀏覽器中。',
        bdd: '以下 Gherkin 是用例的原文，確認後會直接轉成自動化測試。'
      },
      stepState: { done: '完成', here: '進行中', todo: '尚未開始' },
      designBranch: '用例設計如何展開',
      designStep: { matrix: '測試矩陣', state: '狀態機', prototype: '互動原型', bdd: 'BDD 情境', selfReview: '獨立評審' },
      flowLegend: ['★ 人工確認是整個流程中唯一需要你決定的地方；', '其他階段由 AI 完成，並由 CLI 檢查放行條件。確認之後才會開始寫自動化測試。'],
      themeLabel: '切換深色／淺色',
      track: {
        context: '上下文收集', risk: '風險分析', cases: '用例設計', confirm: '人工確認',
        scripts: '腳本生成', run: '執行與修復', review: '代碼審查', report: '報告'
      },
      out: {
        sources: (n) => `${n} 個需求來源`, risks: (n) => `${n} 個風險`, matrices: (n, rows) => `${n} 張矩陣 · ${rows} 列`,
        transitions: (n) => `${n} 條轉換`, screens: (n) => `${n} 個畫面`, demos: (n) => `${n} 個示範`, noPrototype: '不適用',
        scenarios: (n) => `${n} 個情境`, score: (n) => `${n} 分`, confirm: '等待你確認', confirmed: '已確認',
        automated: (n) => `${n} 個 @auto 情境`, run: '執行並修正測試', review: '審查測試與產品碼', report: '發布結論'
      },
      figures: { scenarios: '情境', high: 'P0／P1 情境', riskCoverage: '高風險已覆蓋', matrixRows: '矩陣列有情境', transitions: '狀態轉換', manual: '人工驗收' },
      rows: {
        scope: ['驗收範圍', '這次要驗收的內容與資料來源。'],
        figures: ['覆蓋摘要', '由設計產物自動計算。'],
        risks: ['風險與覆蓋', 'P0 與 P1 必須被情境覆蓋，或寫明延後的理由。'],
        techniques: ['測試設計技法', '12 種技法逐一判定；不適用必須寫出理由。'],
        review: ['獨立評審', '由沒有參與設計的評審依評分標準打分。'],
        questions: ['待釐清', '需要需求方回答的問題，會影響預期結果。'],
        warnings: ['檢查提醒', '不會擋下流程，但值得確認。'],
        transitions: ['轉換表', '允許與應被阻擋的轉換。'],
        diagram: ['狀態圖', '只畫出允許的轉換。'],
        screens: ['畫面對應', '每個畫面驗證哪些情境。'],
        legend: ['Tag 說明', 'CLI 依 tag 做覆蓋檢查。'],
        steps: ['步驟顏色', 'Given、When、Then 各用一種顏色，一眼分出前置、操作與結果。']
      },
      threshold: (n) => `及格門檻 ${n} 分`, rounds: (n) => `共 ${n} 輪評審`, belowThreshold: '未達門檻，已在確認時說明',
      covered: '已覆蓋', uncovered: '未覆蓋', deferred: '延後', na: '不適用', skipped: '不測',
      allowed: '允許', blocked: '阻擋', col: { from: '從', trigger: '觸發條件', to: '到', result: '結果', cases: '情境', screen: '畫面' },
      matrixMeta: (covered, total) => `${covered} / ${total} 列有情境`,
      search: '搜尋情境或步驟', allPriorities: '全部優先級', allTypes: '全部類型', progress: '已核對 {n} / {total}',
      noMatch: '沒有符合篩選條件的情境。', given: '前置條件', when: '操作', then: '預期結果', examples: '資料組合',
      smoke: '冒煙', manualTag: '人工驗收', noMachine: '這個功能沒有需要驗證的狀態轉換。', noMatrix: '沒有測試矩陣。',
      noPrototype: '沒有製作原型：', openPrototype: '在新分頁開啟原型', diagramOffline: '無法載入狀態圖元件（可能離線），請參考轉換表。',
      copy: '複製', copied: '已複製', none: '無',
      legend: {
        suite: ['套件', '@regression 每個情境都要有；核心正向流程再加 @smoke'],
        exec: ['執行', '@auto 代表可以自動化；沒有 @auto 就是人工驗收'],
        nature: ['性質', '@邊界 只標臨界值、資源耗盡、競態、故障這類極端情境'],
        label: ['描述', '其餘中文 tag 描述頁面與情境條件，例如 @登入頁面 @密碼錯誤'],
        index: ['編號', '情境編號、優先級與風險記在 design.json，不放進 tag']
      },
      boundaryTag: '邊界',
      stepLegend: { given: '前置條件', when: '操作', then: '預期結果', and: 'And／But 沿用上一個步驟的顏色' },
    },
    label: {
      run: 'Run', mode: '模式', generated: '產生時間', attempts: '執行次數', total: '總數', covered: '已覆蓋',
      reviewLink: '回到用例審閱頁',
      yes: '是', no: '否', score: '分數', rounds: '輪數', none: '無'
    }
  },
  en: {
    reportTitle: 'QA Acceptance Report',
    verdict: { go: 'Go', conditional: 'Conditional go', 'no-go': 'No-go', incomplete: 'Incomplete' },
    status: {
      passed: 'Passed', failed: 'Failed', blocked: 'Blocked', skipped: 'Skipped', 'not-run': 'Not run', infeasible: 'Not automatable',
      manual: 'Manual', uncovered: 'Uncovered'
    },
    classification: {
      'test-defect': 'Test defect', 'product-defect': 'Product defect', environment: 'Environment',
      'unclear-requirement': 'Unclear requirement'
    },
    section: {
      scope: 'Scope', stats: 'Statistics', reasons: 'Verdict basis', risks: 'Risks', cases: 'Cases',
      failures: 'Failures & blockers', review: 'Code review', timeline: 'Timeline', techniques: 'Design techniques',
      transitions: 'State transitions', rules: 'Business rules', deferred: 'Deferred risks',
      questions: 'Open questions', selfReview: 'Self review'
    },
    col: {
      id: 'ID', title: 'Title', level: 'Level', priority: 'Priority', type: 'Type', risks: 'Risks',
      result: 'Result', cases: 'Cases', impact: 'Impact', technique: 'Technique', applicable: 'Applies',
      note: 'Cases / reason', from: 'From', to: 'To', trigger: 'Trigger', valid: 'Valid', severity: 'Severity',
      file: 'Location', classification: 'Class', reason: 'Detail', stage: 'Stage',
      action: 'Action', at: 'At', steps: 'Steps', expected: 'Expected', preconditions: 'Preconditions',
      conditions: 'Conditions', outcome: 'Outcome'
    },
    technique: {
      equivalence: 'Equivalence partitioning', boundary: 'Boundary values', 'decision-table': 'Decision table',
      path: 'Happy / negative / error paths', 'state-transition': 'State transitions',
      'role-permission': 'Roles & permissions', 'data-lifecycle': 'Data lifecycle', pairwise: 'Pairwise',
      'error-guessing': 'Error guessing', concurrency: 'Concurrency & repeats',
      'dependency-failure': 'Dependency failure', environment: 'Environment & config'
    },
    type: {
      positive: 'Positive', negative: 'Negative', boundary: 'Boundary', error: 'Error', permission: 'Permission',
      state: 'State', concurrency: 'Concurrency', integration: 'Integration', ui: 'UI', performance: 'Performance',
      security: 'Security', regression: 'Regression'
    },
    reviewLabels: {
      checks: 'Deterministic checks', score: 'Score', dimension: 'Dimension', points: 'Points', strengths: 'Strengths', findings: 'Findings', suggestions: 'Suggestions',
      dims: { fidelity: 'Scenario fidelity', reliability: 'Test reliability', style: 'Coding style', productRisk: 'Product risk', maintainability: 'Maintainability' }
    },
    review: {
      kicker: 'Case review', pending: 'Awaiting sign-off', confirmed: 'Signed off', stale: 'Changed after sign-off',
      statusTip: {
        pending: 'Nobody has signed off these scenarios yet. Automation starts after sign-off.',
        confirmed: 'Signed off and locked.',
        stale: 'Scenarios, matrices, state machine or prototype changed after sign-off, so the sign-off no longer applies. Review and sign off again to continue.'
      },
      tabs: { overview: 'How it was built', matrix: 'Test matrix', state: 'State machine', prototype: 'Prototype', acceptance: 'Acceptance list', bdd: 'BDD features' },
      intro: {
        overview: 'The workflow has 8 stages; the diagram shows each stage\'s output and where this run stands. Case design is broken down underneath: test matrices, a state machine and a prototype expand the scenarios, which are then written as BDD and scored by an independent reviewer.',
        matrix: 'Each row is a condition combination to verify. Covered rows list their scenarios; rows not tested state why.',
        state: 'States and transitions. Every allowed transition has a scenario; every blocked transition has a negative scenario.',
        prototype: 'Pick a scenario on the left and the device plays it out; you can also click and type freely to walk through the flow.',
        acceptance: 'One block per scenario: preconditions, action, expected result. Tick each one as you verify it; ticks stay in your browser.',
        bdd: 'The Gherkin below is the source of truth and becomes the automated tests after sign-off.'
      },
      stepState: { done: 'Done', here: 'In progress', todo: 'Not started' },
      designBranch: 'How cases are designed',
      designStep: { matrix: 'Test matrix', state: 'State machine', prototype: 'Prototype', bdd: 'BDD scenarios', selfReview: 'Independent review' },
      flowLegend: ['★ Sign-off is the only step that needs your decision; ', 'every other stage is done by AI and gated by the CLI. Automation starts only after sign-off.'],
      themeLabel: 'Toggle dark / light',
      track: {
        context: 'Context', risk: 'Risk analysis', cases: 'Case design', confirm: 'Sign-off',
        scripts: 'Scripts', run: 'Run & repair', review: 'Code review', report: 'Report'
      },
      out: {
        sources: (n) => `${n} sources`, risks: (n) => `${n} risks`, matrices: (n, rows) => `${n} matrices · ${rows} rows`,
        transitions: (n) => `${n} transitions`, screens: (n) => `${n} screens`, demos: (n) => `${n} demos`, noPrototype: 'Not applicable',
        scenarios: (n) => `${n} scenarios`, score: (n) => `${n} pts`, confirm: 'Waiting for you', confirmed: 'Signed off',
        automated: (n) => `${n} @auto scenarios`, run: 'Run and fix tests', review: 'Review tests and code', report: 'Publish verdict'
      },
      figures: { scenarios: 'Scenarios', high: 'P0 / P1', riskCoverage: 'High risks covered', matrixRows: 'Matrix rows covered', transitions: 'Transitions', manual: 'Manual checks' },
      rows: {
        scope: ['Scope', 'What is being accepted, and where it comes from.'],
        figures: ['Coverage', 'Calculated from the design artifacts.'],
        risks: ['Risks & coverage', 'P0 and P1 must be covered or explicitly deferred.'],
        techniques: ['Design techniques', 'All 12 techniques are judged; not applicable needs a reason.'],
        review: ['Independent review', 'Scored against the rubric by a reviewer who did not write the cases.'],
        questions: ['Open questions', 'Answers may change expected results.'],
        warnings: ['Check warnings', 'Not blocking, but worth a look.'],
        transitions: ['Transitions', 'Allowed and blocked transitions.'],
        diagram: ['Diagram', 'Allowed transitions only.'],
        screens: ['Screens', 'Which scenarios each screen verifies.'],
        legend: ['Tags', 'The CLI checks coverage from tags.'],
        steps: ['Step colors', 'Given, When and Then each have their own color.']
      },
      threshold: (n) => `Pass mark ${n}`, rounds: (n) => `${n} review rounds`, belowThreshold: 'Below the pass mark; explained at sign-off',
      covered: 'Covered', uncovered: 'Uncovered', deferred: 'Deferred', na: 'Not applicable', skipped: 'Not tested',
      allowed: 'Allowed', blocked: 'Blocked', col: { from: 'From', trigger: 'Trigger', to: 'To', result: 'Result', cases: 'Scenarios', screen: 'Screen' },
      matrixMeta: (covered, total) => `${covered} / ${total} rows covered`,
      search: 'Search scenarios or steps', allPriorities: 'All priorities', allTypes: 'All types', progress: 'Checked {n} / {total}',
      noMatch: 'No scenarios match these filters.', given: 'Given', when: 'When', then: 'Then', examples: 'Data sets',
      smoke: 'Smoke', manualTag: 'Manual', noMachine: 'No state transitions to verify.', noMatrix: 'No test matrix.',
      noPrototype: 'No prototype: ', openPrototype: 'Open prototype in a new tab', diagramOffline: 'Diagram unavailable (offline?). See the transition table.',
      copy: 'Copy', copied: 'Copied', none: 'None',
      legend: {
        suite: ['Suite', 'Every scenario has @regression; core happy paths also get @smoke'],
        exec: ['Execution', '@auto means automatable; without it the scenario is checked manually'],
        nature: ['Nature', 'Boundary tags mark only extremes: limits, exhaustion, races, failures'],
        label: ['Labels', 'Other tags describe the page and condition'],
        index: ['IDs', 'IDs, priority and risks live in design.json, not in tags']
      },
      boundaryTag: 'Boundary',
      stepLegend: { given: 'precondition', when: 'action', then: 'expected result', and: 'And / But inherit the previous step color' },
    },
    label: {
      run: 'Run', mode: 'Mode', generated: 'Generated', attempts: 'Attempts', total: 'Total', covered: 'Covered',
      reviewLink: 'Open case review',
      yes: 'Yes', no: 'No', score: 'Score', rounds: 'Rounds', none: 'None'
    }
  }
};

export const dictionary = (language) => DICT[language] ?? DICT['zh-TW'];
