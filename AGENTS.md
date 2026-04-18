# Project Preferences & Design Rules

## Dashboard Layout
- **Style**: Bento Grid (clean cards with rounded corners, subtle shadows, and colored headers).
- **Grid Configuration**: The "Absent List" and "Failed List" section uses a `grid-cols-5` layout on large screens.
  - **Absent List**: `lg:col-span-2` (40% width).
  - **Failed List**: `lg:col-span-3` (60% width).

## Table Design
- **Name Wrapping**: All student names in dashboard tables must use `whitespace-nowrap` to prevent breaking into multiple lines.
- **Typography**:
  - General UI: Inter (sans-serif).
  - Identification (SBD): JetBrains Mono for a technical, precise feel.
- **Padding**: Use compact padding (e.g., `px-4 py-3`) for dashboard tables to fit more content.

## Color Palette
- **General**: Indigo/Slate for data structures.
- **Warning/Absence**: Red accents (`bg-red-50`, `text-red-700`).
- **Failure/Alert**: Orange accents (`bg-orange-50`, `text-orange-700`).
- **Success/Top**: Emerald/Green accents.

## Group Comparison (So sánh Cụm)
- **School Name Mapping**:
  - `CUM` → CỤM CHUYÊN MÔN
  - `ND` → NGUYỄN DU
  - `TĐT` → TÔN ĐỨC THẮNG
  - `VVK` → VÕ VĂN KIỆT
  - `PVĐ` → PHẠM VĂN ĐỒNG
  - `LHP` → LÊ HỒNG PHONG
  - `NTMK` → NGUYỄN THỊ MINH KHAI
  - `TQT` → TRẦN QUỐC TUẤN
  - `TS` → TRẦN SUYỀN
  - `TBT` → TRẦN BÌNH TRỌNG
  - `NBN` → NGUYỄN BÁ NGỌC
  - `PBC` → PHAN BỘI CHÂU
- **Detailed Table Layout**:
  - Show the selected school's detailed table above the general summary.
  - Exclude the `TT` (index) column to maximize screen width.
  - Score ranges must show both **SL** (Count) and **TL%** (Percentage).
  - Use high-contrast font weights (Black/900) and bold red secondary colors for TL% columns.
  - **Comparison Columns**: Always include a "TB TRỞ LÊN (PVĐ)" column in the detailed table to show comparative data.

## Statistical Calculation Rules
- **Score Ranges**: Calculations for Mean (ĐTB), Median, and Std Dev must strictly use the counts from these ranges: `0-3.4`, `3.5-4.9`, `5.0-6.4`, `6.5-7.9`, `8.0-10`.
- **Midpoints for Mean**: `[1.7, 4.2, 5.7, 7.2, 9.0]`.
- **Median Interpolation Borders**: `[0, 3.45, 4.95, 6.45, 7.95, 10.0]`.
- **Dynamic Header Support**: Columns for these ranges must be detected by keywords (e.g., "0-3.4", "Kém", "Yếu", "Tb", "Khá", "Giỏi") to handle variations in Excel sheet layouts.

## Comparative Assessment Logic
- **Tone**: Non-academic, friendly, and intuitive (e.g., "ngang ngửa", "nhỉnh hơn", "chắc tay").
- **Exclusion**: Do NOT show the assessment if the selected school is "PVĐ".
- **Phrasing for Consistency**:
  - For high concentration/consistency: "Điểm số đồng đều hơn, ít xảy ra tình trạng chênh lệch quá lớn giữa các nhóm điểm."
  - For high performance: "Làm bài có vẻ 'chắc tay' và điểm số tập trung hơn."
- **Data Integrity**: Always fetch and use PVĐ's detailed sheet data as the baseline for comparison. Use fuzzy matching for subject names (e.g., "Văn" vs "Ngữ Văn").

## Comparison History (So sánh Lần trước)
- **Menu Position**: Placed between "THỐNG KÊ LỚP" and "SO SÁNH CỤM".
- **Storage**: Data is managed independently in `comparison_data/latest` to avoid affecting school/class results.
- **Import Requirement**: File only needs LẦN 1 and LẦN 2 data for both "Tỉ lệ TB trở lên" and "Điểm thi TB".
- **Auto-calculation**: The app must automatically calculate `Tăng/Giảm = Lần 2 - Lần 1`.
- **Condition Styling**:
  - Positive increase (> 0): Emerald green text/background.
  - Negative decrease (< 0): Red text/background.
- **Header Structure**: Two-tier header showing subjects followed by multi-column groups for Rates and Scores.
