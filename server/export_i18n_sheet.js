const path = require('path');
const ExcelJS = require('exceljs');

const ITEMS = [
  // 1. Chung & Thanh điều hướng (Sidebar / Common)
  ['app.title', '1. Chung & Menu', 'Mealcount Management', 'Mealcount Management', '식수 관리 시스템'],
  ['app.subtitle', '1. Chung & Menu', 'Giám sát suất ăn hàng ngày', 'Daily Meal Monitoring', '일일 식수 모니터링'],
  ['nav.dashboard1', '1. Chung & Menu', 'Dashboard 1: Tình hình Suất ăn', 'Dashboard 1: Meal Status', '대시보드 1: 식수 현황'],
  ['nav.dashboard2', '1. Chung & Menu', 'Dashboard 2: Cảnh báo & Xu hướng', 'Dashboard 2: Alerts & Trends', '대시보드 2: 경고 및 추이'],
  ['nav.meals', '1. Chung & Menu', 'Thực tế D-1 (Suất & DT)', 'D-1 Actuals (Meals & Rev)', 'D-1 실적 입력 (식수/매출)'],
  ['nav.standards', '1. Chung & Menu', 'Kế hoạch & Năm trước', 'Plan & Last Year', '경영계획 및 전년 실적'],
  ['nav.reports', '1. Chung & Menu', 'Báo cáo Excel & Email', 'Excel & Email Reports', '엑셀 보고서 및 이메일'],
  ['nav.alerts', '1. Chung & Menu', 'Cảnh báo Zalo / Kakao', 'Zalo / Kakao Alerts', 'Zalo / 카카오 알림'],
  ['nav.org', '1. Chung & Menu', 'Cơ cấu Tổ chức (SM/AM)', 'Organization (SM/AM)', '조직도 관리 (SM/AM)'],
  ['nav.users', '1. Chung & Menu', 'Tài khoản & Phân quyền', 'Users & Permissions', '계정 및 권한 관리'],
  ['common.scope', '1. Chung & Menu', 'Phạm vi', 'Scope', '관리 범위'],
  ['common.all_blocks', '1. Chung & Menu', 'Tất cả Khối / Ban', 'All Divisions / Teams', '전체 운영팀'],
  ['common.logout', '1. Chung & Menu', 'Đăng xuất', 'Log out', '로그아웃'],
  ['common.save', '1. Chung & Menu', 'Lưu', 'Save', '저장'],
  ['common.cancel', '1. Chung & Menu', 'Hủy', 'Cancel', '취소'],
  ['common.search', '1. Chung & Menu', 'Tìm mã hoặc tên bếp...', 'Search kitchen code or name...', '사업장 코드 또는 명칭 검색...'],
  ['common.refresh', '1. Chung & Menu', 'Làm mới dữ liệu', 'Refresh data', '새로고침'],
  ['common.export_excel', '1. Chung & Menu', 'Xuất Excel', 'Export Excel', '엑셀 다운로드'],

  // 2. Vai trò (Roles)
  ['role.admin', '2. Vai trò & Đăng nhập', 'Quản trị viên (Admin)', 'Administrator (Admin)', '시스템 관리자 (Admin)'],
  ['role.block_manager', '2. Vai trò & Đăng nhập', 'SM - Giám đốc Vùng / Khối', 'SM - Regional Director', 'SM (지역장 / 본부장)'],
  ['role.site_staff', '2. Vai trò & Đăng nhập', 'AM - Quản lý Vùng / Bếp', 'AM - Area Manager', 'AM (구역장 / 매니저)'],
  ['role.viewer', '2. Vai trò & Đăng nhập', 'Chỉ xem (Viewer)', 'Viewer (Read-only)', '열람 전용 (Viewer)'],
  ['login.username', '2. Vai trò & Đăng nhập', 'Tên đăng nhập', 'Username', '아이디'],
  ['login.password', '2. Vai trò & Đăng nhập', 'Mật khẩu', 'Password', '비밀번호'],
  ['login.submit', '2. Vai trò & Đăng nhập', 'Đăng nhập', 'Sign In', '로그인'],

  // 3. Dashboard 1 (Báo cáo điều hành)
  ['d1.banner', '3. Dashboard 1', '[TÌNH HÌNH SUẤT ĂN NGÀY {d} THÁNG {m} ({dow})]', '[DAILY MEAL STATUS - {m}/{d} ({dow})]', '[{m}월 {d}일({dow}) 식수 현황]'],
  ['d1.sec1_title', '3. Dashboard 1', 'TÌNH HÌNH SUẤT ĂN TOÀN CÔNG TY', 'COMPANY-WIDE MEAL STATUS', '전체 식수 현황'],
  ['d1.total_meals', '3. Dashboard 1', 'TỔNG SUẤT ĂN', 'TOTAL MEALS', '전체 식수'],
  ['d1.total_revenue', '3. Dashboard 1', 'DOANH THU', 'REVENUE', '총 매출'],
  ['d1.day', '3. Dashboard 1', 'NGÀY', 'DAILY', '당일'],
  ['d1.mtd', '3. Dashboard 1', 'LŨY KẾ', 'MTD CUMULATIVE', '누계'],
  ['d1.completion_rate', '3. Dashboard 1', 'TỈ LỆ HOÀN THÀNH', 'ACHIEVEMENT RATE', '달성율'],
  ['d1.growth_rate', '3. Dashboard 1', 'TỈ LỆ TĂNG TRƯỞNG', 'GROWTH RATE (YoY)', '신장률'],
  ['d1.unit_thousand_meals', '3. Dashboard 1', 'nghìn suất', 'K meals', '천식'],
  ['d1.unit_billion_vnd', '3. Dashboard 1', 'tỷ đồng', 'B VND', '십억 동'],
  ['d1.sec2_title', '3. Dashboard 1', 'TÌNH HÌNH SUẤT ĂN THEO ĐIỀU HÀNH', 'MEAL STATUS BY OPERATING TEAM', '운영팀별 식수 현황'],
  ['d1.operating_team', '3. Dashboard 1', 'ĐIỀU HÀNH', 'OPERATING TEAM', '운영팀'],
  ['d1.total_row', '3. Dashboard 1', 'TỔNG', 'TOTAL', '합계'],
  ['d1.actual', '3. Dashboard 1', 'Thực tế', 'Actual', '금년 (실적)'],
  ['d1.target', '3. Dashboard 1', 'Suất ăn mục tiêu / Mục tiêu', 'Target (Plan)', '경영계획 식수'],
  ['d1.vs_target', '3. Dashboard 1', 'So với mục tiêu', 'vs Target', '경영계획 比'],
  ['d1.last_year', '3. Dashboard 1', 'Năm ngoái', 'Last Year', '전년'],
  ['d1.vs_last_year', '3. Dashboard 1', 'So với năm ngoái', 'vs Last Year', '전년比'],
  ['d1.sec3_title', '3. Dashboard 1', 'TÌNH HÌNH SUẤT ĂN TRUNG BÌNH THEO TUẦN CỦA CÁC ĐIỀU HÀNH', 'WEEKLY AVERAGE MEALS BY OPERATING TEAM', '주간 평균 식사량'],
  ['d1.week1', '3. Dashboard 1', 'Tuần 1 (1주)', 'Week 1', '1주'],
  ['d1.week2', '3. Dashboard 1', 'Tuần 2 (2주)', 'Week 2', '2주'],
  ['d1.week3', '3. Dashboard 1', 'Tuần 3 (3주)', 'Week 3', '3주'],
  ['d1.week4', '3. Dashboard 1', 'Tuần 4 (4주)', 'Week 4', '4주'],
  ['d1.sec4_title', '3. Dashboard 1', 'TÌNH HÌNH SUẤT ĂN THEO TỪNG BẾP', 'MEAL STATUS BY KITCHEN / SITE', '사업장별 식수 현황'],

  // 4. Dashboard 2 (Cảnh báo & Xu hướng)
  ['d2.title', '4. Dashboard 2', 'Dashboard Monitoring Suất Ăn (D-1)', 'Meal Monitoring Dashboard (D-1)', '식수 모니터링 대시보드 (D-1)'],
  ['d2.mode_day', '4. Dashboard 2', 'Theo ngày (D-1)', 'By Day (D-1)', '일별 (D-1)'],
  ['d2.mode_range', '4. Dashboard 2', 'Từ ngày - Đến ngày', 'Date Range', '기간별'],
  ['d2.mode_month', '4. Dashboard 2', 'Theo tháng', 'By Month', '월별'],
  ['d2.kpi_meals', '4. Dashboard 2', 'Suất Thực tế / KH', 'Actual / Plan Meals', '실적 / 계획 식수'],
  ['d2.kpi_alerts', '4. Dashboard 2', 'Cảnh báo giảm ≥ 3%', 'Drop Alerts (≥ 3%)', '식수 감소 경고 (≥ 3%)'],
  ['d2.kpi_rev_impact', '4. Dashboard 2', 'Ảnh hưởng Doanh thu KH', 'Plan Revenue Impact', '계획 매출 영향'],
  ['d2.kpi_profit_impact', '4. Dashboard 2', 'Ảnh hưởng Lợi nhuận KH', 'Plan Profit Impact', '계획 이익 영향'],
  ['d2.overall_trend', '4. Dashboard 2', 'Xu hướng Suất ăn Tổng hợp', 'Overall Meal Trend', '전체 식수 추이'],
  ['d2.block_trends', '4. Dashboard 2', 'Biểu đồ Xu hướng Suất ăn theo từng Khối / Ban điều hành', 'Meal Trend by Operating Team', '운영팀별 식수 추이 차트'],
  ['d2.select_all', '4. Dashboard 2', 'Chọn tất cả', 'Select All', '전체 선택'],
  ['d2.clear_all', '4. Dashboard 2', 'Bỏ chọn', 'Clear All', '선택 해제'],
  ['d2.only_alerts', '4. Dashboard 2', 'Chỉ hiện cảnh báo (≥3% giảm)', 'Show alerts only (≥3% drop)', '경고 사업장만 보기 (≥3% 감소)'],
  ['d2.status_ok', '4. Dashboard 2', 'Đạt / Ổn định', 'Normal', '정상'],
  ['d2.status_alert', '4. Dashboard 2', 'Giảm ≥3%', 'Drop ≥3%', '3% 이상 감소'],
  ['d2.status_pending', '4. Dashboard 2', 'Chưa nhập', 'Not reported', '미입력'],

  // 5. Nhập Thực tế D-1 & Kế hoạch / Năm trước
  ['meals.title', '5. Thực tế D-1 & Kế hoạch', 'Cập nhật Thực tế D-1 (Suất ăn & Doanh thu)', 'Update D-1 Actuals (Meals & Revenue)', 'D-1 실적 입력 (식수 및 매출)'],
  ['meals.auto_rev_btn', '5. Thực tế D-1 & Kế hoạch', 'Tự tính DT = Suất × Đơn giá', 'Auto-calc Rev = Meals × Unit Price', '매출 자동계산 (식수 × 단가)'],
  ['meals.download_tpl', '5. Thực tế D-1 & Kế hoạch', 'Tải mẫu Excel Dạng Cột (Tháng)', 'Download Column Template (Month)', '월간 열(Column) 양식 다운로드'],
  ['meals.import_btn', '5. Thực tế D-1 & Kế hoạch', 'Import Excel/CSV Thực tế', 'Import Actual Excel/CSV', '실적 엑셀/CSV 업로드'],
  ['meals.gsheet_sync', '5. Thực tế D-1 & Kế hoạch', 'Đồng bộ Tự động Thực tế D-1 từ Google Sheet', 'Auto-sync D-1 Actuals from Google Sheet', '구글 시트 D-1 실적 자동 동기화'],
  ['plans.title', '5. Thực tế D-1 & Kế hoạch', 'Kế hoạch & Dữ liệu Năm trước (Nhập 1 lần)', 'Plan & Last Year Data (One-time Setup)', '경영계획 및 전년 실적 관리'],
  ['plans.tab_daily', '5. Thực tế D-1 & Kế hoạch', '1. Kế hoạch & Năm trước theo ngày', '1. Daily Plan & Last Year', '1. 일별 경영계획 및 전년 실적'],
  ['plans.tab_catalog', '5. Thực tế D-1 & Kế hoạch', '2. Đơn giá & Tỷ suất LN Bếp', '2. Kitchen Unit Price & Profit Margin', '2. 사업장 단가 및 이익률'],
  ['plans.download_month', '5. Thực tế D-1 & Kế hoạch', 'Tải Mẫu Tháng', 'Download Monthly Template', '월간 양식 다운로드'],
  ['plans.download_year', '5. Thực tế D-1 & Kế hoạch', 'Tải Mẫu Cả Năm', 'Download Yearly Template', '연간 양식 다운로드'],

  // 6. Báo cáo, Cảnh báo Zalo/Kakao, Cơ cấu tổ chức
  ['reports.title', '6. Báo cáo & Cảnh báo & Tổ chức', 'Báo cáo Excel Theo Mẫu & Email', 'Standard Excel Reports & Email', '표준 엑셀 보고서 및 이메일'],
  ['alerts.title', '6. Báo cáo & Cảnh báo & Tổ chức', 'Cảnh báo Zalo Bot & KakaoTalk', 'Zalo Bot & KakaoTalk Alerts', 'Zalo 봇 및 카카오톡 알림'],
  ['alerts.preview', '6. Báo cáo & Cảnh báo & Tổ chức', 'Xem trước Tin nhắn Cảnh báo', 'Alert Message Preview', '알림 메시지 미리보기'],
  ['alerts.send_zalo', '6. Báo cáo & Cảnh báo & Tổ chức', 'Gửi Test Zalo Bot', 'Send Test to Zalo Bot', 'Zalo 테스트 발송'],
  ['alerts.send_kakao', '6. Báo cáo & Cảnh báo & Tổ chức', 'Gửi Test KakaoTalk', 'Send Test to KakaoTalk', '카카오톡 테스트 발송'],
  ['org.title', '6. Báo cáo & Cảnh báo & Tổ chức', 'Cơ cấu Tổ chức (SM / AM) & Đồng bộ Google Sheet', 'Organization Structure (SM / AM) & Google Sheet Sync', '조직도 (SM / AM) 및 구글 시트 동기화'],
  ['org.unit_list', '6. Báo cáo & Cảnh báo & Tổ chức', 'Danh sách Khối / Ban / Phòng & Giám đốc Vùng (SM)', 'Divisions / Teams & Regional Directors (SM)', '운영팀 및 지역장(SM) 목록'],
  ['org.am_assign', '6. Báo cáo & Cảnh báo & Tổ chức', 'Phân công AM (Quản lý Vùng) phụ trách Bếp / Địa điểm', 'Assign Area Managers (AM) to Kitchens', '구역장(AM) 담당 사업장 배정'],
];

async function generate() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Bang_Dich_VI_EN_KO', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Mã (Key)', key: 'key', width: 24 },
    { header: 'Nhóm màn hình (Module)', key: 'mod', width: 28 },
    { header: 'Tiếng Việt (VI - Gốc)', key: 'vi', width: 44 },
    { header: 'Tiếng Anh (EN - Gợi ý / Chỉnh sửa)', key: 'en', width: 44 },
    { header: 'Tiếng Hàn (KO - Gợi ý / Chỉnh sửa)', key: 'ko', width: 44 },
  ];
  const h = ws.getRow(1);
  h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  h.height = 26;

  for (const [key, mod, vi, en, ko] of ITEMS) {
    ws.addRow({ key, mod, vi, en, ko });
  }

  const outPath = path.join(__dirname, '..', 'Bang_Dich_Ngon_Ngu_VI_EN_KO.xlsx');
  await wb.xlsx.writeFile(outPath);
  console.log('SAVED:', outPath);
}

generate();
