package service

import (
	"fmt"
	"nurse-scheduler/backend/internal/domain"
	"time"

	"github.com/xuri/excelize/v2"
)

var thaiMonths = []string{
	"", "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
	"กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
}

// GenerateExcel creates a 3-sheet Excel spreadsheet from ScheduleSummary and Roster.
func GenerateExcel(r domain.Roster, summary domain.ScheduleSummary) ([]byte, error) {
	f := excelize.NewFile()
	defer f.Close()

	sheet1 := "ตารางเวร"
	sheet2 := "สรุปภาระงาน"
	sheet3 := "ข้อผิดพลาดและคำเตือน"

	// Rename default sheet
	f.SetSheetName("Sheet1", sheet1)
	f.NewSheet(sheet2)
	f.NewSheet(sheet3)

	loc, err := time.LoadLocation(r.Timezone)
	if err != nil {
		loc = time.UTC
	}
	daysInMonth := time.Date(r.Year, time.Month(r.Month)+1, 0, 0, 0, 0, 0, loc).Day()
	buddhistYear := r.Year + 543
	monthName := thaiMonths[r.Month]

	// Styles
	titleStyle, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Bold: true, Size: 16, Color: "1e293b"},
	})
	subTitleStyle, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Size: 11, Color: "64748b"},
	})
	headerStyle, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Color: "ffffff"},
		Fill:      excelize.Fill{Type: "pattern", Color: []string{"1e3a8a"}, Pattern: 1},
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center", WrapText: true},
		Border: []excelize.Border{
			{Type: "left", Color: "cbd5e1", Style: 1},
			{Type: "top", Color: "cbd5e1", Style: 1},
			{Type: "right", Color: "cbd5e1", Style: 1},
			{Type: "bottom", Color: "cbd5e1", Style: 1},
		},
	})
	holidayHeaderStyle, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Color: "ffffff"},
		Fill:      excelize.Fill{Type: "pattern", Color: []string{"831843"}, Pattern: 1}, // Purple
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center", WrapText: true},
		Border: []excelize.Border{
			{Type: "left", Color: "cbd5e1", Style: 1},
			{Type: "top", Color: "cbd5e1", Style: 1},
			{Type: "right", Color: "cbd5e1", Style: 1},
			{Type: "bottom", Color: "cbd5e1", Style: 1},
		},
	})
	cellCenterStyle, _ := f.NewStyle(&excelize.Style{
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
		Border: []excelize.Border{
			{Type: "left", Color: "e2e8f0", Style: 1},
			{Type: "top", Color: "e2e8f0", Style: 1},
			{Type: "right", Color: "e2e8f0", Style: 1},
			{Type: "bottom", Color: "e2e8f0", Style: 1},
		},
	})
	cellBoldCenterStyle, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true},
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
		Border: []excelize.Border{
			{Type: "left", Color: "cbd5e1", Style: 1},
			{Type: "top", Color: "cbd5e1", Style: 1},
			{Type: "right", Color: "cbd5e1", Style: 1},
			{Type: "bottom", Color: "cbd5e1", Style: 1},
		},
	})
	cellLeftStyle, _ := f.NewStyle(&excelize.Style{
		Alignment: &excelize.Alignment{Horizontal: "left", Vertical: "center"},
		Border: []excelize.Border{
			{Type: "left", Color: "e2e8f0", Style: 1},
			{Type: "top", Color: "e2e8f0", Style: 1},
			{Type: "right", Color: "e2e8f0", Style: 1},
			{Type: "bottom", Color: "e2e8f0", Style: 1},
		},
	})
	warnStyle, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Bold: true, Color: "dc2626"},
	})

	// ==================== SHEET 1: ตารางเวร ====================
	// Title & Metadata
	f.SetCellValue(sheet1, "A1", fmt.Sprintf("ตารางการปฏิบัติงาน — %s ประจำเดือน %s พ.ศ. %d (รุ่น #%d)", r.WardID, monthName, buddhistYear, r.Version))
	f.SetCellStyle(sheet1, "A1", "A1", titleStyle)

	statusLabel := map[string]string{
		"draft": "ร่าง (Draft)", "generated": "สร้างแล้ว (Generated)",
		"under_review": "รอตรวจ/อนุมัติ (Under Review)", "approved": "อนุมัติแล้ว (Approved)", "published": "ประกาศใช้งาน (Published)",
	}[r.Status]
	if statusLabel == "" {
		statusLabel = r.Status
	}

	draftNote := ""
	if r.Status == "draft" || r.Status == "generated" || r.Status == "under_review" {
		draftNote = " [ ⚠️ ฉบับร่าง — ใช้สำหรับตรวจทานเท่านั้น ไม่ใช่เอกสารประกาศใช้จริง ]"
	}

	f.SetCellValue(sheet1, "A2", fmt.Sprintf("สถานะ: %s | เขตเวลา: %s | วันที่ส่งออกข้อมูล: %s%s", statusLabel, r.Timezone, time.Now().Format("02/01/2006 15:04"), draftNote))
	f.SetCellStyle(sheet1, "A2", "A2", subTitleStyle)
	if draftNote != "" {
		f.SetCellStyle(sheet1, "A2", "A2", warnStyle)
	}

	// Header Columns
	f.SetCellValue(sheet1, "A4", "ลำดับ")
	f.SetCellValue(sheet1, "B4", "ชื่อ - นามสกุล")
	f.SetCellValue(sheet1, "C4", "ตำแหน่ง")
	f.SetCellStyle(sheet1, "A4", "C4", headerStyle)

	// Holiday Map
	holMap := map[string]string{}
	for _, h := range r.Holidays {
		holMap[h.Date] = h.Name
	}

	// Date Headers
	for d := 1; d <= daysInMonth; d++ {
		colName, _ := excelize.ColumnNumberToName(3 + d)
		dateStr := fmt.Sprintf("%04d-%02d-%02d", r.Year, r.Month, d)
		t := time.Date(r.Year, time.Month(r.Month), d, 0, 0, 0, 0, loc)
		dayOfWeek := thaiDays[t.Weekday()]
		holName, isHol := holMap[dateStr]

		cellHeader := fmt.Sprintf("%d\n%s", d, dayOfWeek)
		if isHol {
			cellHeader = fmt.Sprintf("★ %d\n%s", d, holName)
		}
		f.SetCellValue(sheet1, fmt.Sprintf("%s4", colName), cellHeader)
		if isHol || t.Weekday() == 0 || t.Weekday() == 6 {
			f.SetCellStyle(sheet1, fmt.Sprintf("%s4", colName), fmt.Sprintf("%s4", colName), holidayHeaderStyle)
		} else {
			f.SetCellStyle(sheet1, fmt.Sprintf("%s4", colName), fmt.Sprintf("%s4", colName), headerStyle)
		}
	}

	// Summary Headers on the right (Comprehensive Payroll & Workload Columns)
	sumColStart := 3 + daysInMonth + 1
	sumCols := []string{"ชั่วโมงจริง", "เครดิตวันลา", "รวมเครดิต", "OT (เวร)", "หน่วย บด", "ค่าเวร บด (฿)", "เงิน OT (฿)", "รวมสุทธิ (฿)"}
	for idx, sc := range sumCols {
		colName, _ := excelize.ColumnNumberToName(sumColStart + idx)
		f.SetCellValue(sheet1, fmt.Sprintf("%s4", colName), sc)
		f.SetCellStyle(sheet1, fmt.Sprintf("%s4", colName), fmt.Sprintf("%s4", colName), headerStyle)
	}

	// Assignment Map
	assignMap := map[string]string{}
	for _, c := range r.Assignments {
		val := c.ShiftCode
		if c.Locked {
			val += " 🔒"
		}
		assignMap[c.NurseID+"|"+c.Date] = val
	}

	// Nurse Stats Map
	nStatMap := map[string]domain.NurseMonthStat{}
	for _, ns := range summary.NurseStats {
		nStatMap[ns.NurseID] = ns
	}

	// Staff Rows
	rowNum := 5
	for idx, nurse := range r.Staff {
		f.SetCellValue(sheet1, fmt.Sprintf("A%d", rowNum), idx+1)
		f.SetCellValue(sheet1, fmt.Sprintf("B%d", rowNum), nurse.Name)
		f.SetCellValue(sheet1, fmt.Sprintf("C%d", rowNum), nurse.Position)
		f.SetCellStyle(sheet1, fmt.Sprintf("A%d", rowNum), fmt.Sprintf("A%d", rowNum), cellCenterStyle)
		f.SetCellStyle(sheet1, fmt.Sprintf("B%d", rowNum), fmt.Sprintf("B%d", rowNum), cellLeftStyle)
		f.SetCellStyle(sheet1, fmt.Sprintf("C%d", rowNum), fmt.Sprintf("C%d", rowNum), cellCenterStyle)

		for d := 1; d <= daysInMonth; d++ {
			colName, _ := excelize.ColumnNumberToName(3 + d)
			dateStr := fmt.Sprintf("%04d-%02d-%02d", r.Year, r.Month, d)
			shiftVal := assignMap[nurse.ID+"|"+dateStr]
			if shiftVal == "" {
				shiftVal = "—"
			}
			f.SetCellValue(sheet1, fmt.Sprintf("%s%d", colName, rowNum), shiftVal)
			f.SetCellStyle(sheet1, fmt.Sprintf("%s%d", colName, rowNum), fmt.Sprintf("%s%d", colName, rowNum), cellCenterStyle)
		}

		ns := nStatMap[nurse.ID]
		f.SetCellValue(sheet1, fmt.Sprintf("%s%d", getColName(sumColStart+0), rowNum), ns.ActualWorkHours)
		f.SetCellValue(sheet1, fmt.Sprintf("%s%d", getColName(sumColStart+1), rowNum), ns.LeaveCreditHours)
		f.SetCellValue(sheet1, fmt.Sprintf("%s%d", getColName(sumColStart+2), rowNum), ns.CreditHours)
		f.SetCellValue(sheet1, fmt.Sprintf("%s%d", getColName(sumColStart+3), rowNum), ns.OTShifts)
		f.SetCellValue(sheet1, fmt.Sprintf("%s%d", getColName(sumColStart+4), rowNum), ns.PayableEveNightShifts)
		f.SetCellValue(sheet1, fmt.Sprintf("%s%d", getColName(sumColStart+5), rowNum), ns.EveNightPay)
		f.SetCellValue(sheet1, fmt.Sprintf("%s%d", getColName(sumColStart+6), rowNum), ns.OTPay)
		f.SetCellValue(sheet1, fmt.Sprintf("%s%d", getColName(sumColStart+7), rowNum), ns.TotalPay)

		for cIdx := 0; cIdx < len(sumCols); cIdx++ {
			cName := getColName(sumColStart + cIdx)
			f.SetCellStyle(sheet1, fmt.Sprintf("%s%d", cName, rowNum), fmt.Sprintf("%s%d", cName, rowNum), cellCenterStyle)
		}

		rowNum++
	}

	// Total Summary Row
	f.SetCellValue(sheet1, fmt.Sprintf("B%d", rowNum), "รวมทั้งสิ้น")
	f.SetCellValue(sheet1, fmt.Sprintf("%s%d", getColName(sumColStart+0), rowNum), summary.Totals.TotalPlannedHours)
	f.SetCellValue(sheet1, fmt.Sprintf("%s%d", getColName(sumColStart+5), rowNum), summary.Totals.TotalEveNightPay)
	f.SetCellValue(sheet1, fmt.Sprintf("%s%d", getColName(sumColStart+6), rowNum), summary.Totals.TotalOTPay)
	f.SetCellValue(sheet1, fmt.Sprintf("%s%d", getColName(sumColStart+7), rowNum), summary.Totals.GrandTotalPay)
	for c := 1; c <= sumColStart+len(sumCols)-1; c++ {
		cName := getColName(c)
		f.SetCellStyle(sheet1, fmt.Sprintf("%s%d", cName, rowNum), fmt.Sprintf("%s%d", cName, rowNum), cellBoldCenterStyle)
	}

	// 3 Official Signatures Block
	sigRow := rowNum + 3
	f.SetCellValue(sheet1, fmt.Sprintf("B%d", sigRow), "ลงชื่อ ....................................................")
	f.SetCellValue(sheet1, fmt.Sprintf("B%d", sigRow+1), "( .................................................... )")
	f.SetCellValue(sheet1, fmt.Sprintf("B%d", sigRow+2), "ผู้จัดทำตารางเวร")

	midCol := 3 + (daysInMonth / 2)
	f.SetCellValue(sheet1, fmt.Sprintf("%s%d", getColName(midCol), sigRow), "ลงชื่อ ....................................................")
	f.SetCellValue(sheet1, fmt.Sprintf("%s%d", getColName(midCol), sigRow+1), fmt.Sprintf("( %s )", r.ApprovedBy))
	f.SetCellValue(sheet1, fmt.Sprintf("%s%d", getColName(midCol), sigRow+2), "ผู้ตรวจ / หัวหน้าหอผู้ป่วย")

	lastCol := sumColStart + 2
	f.SetCellValue(sheet1, fmt.Sprintf("%s%d", getColName(lastCol), sigRow), "ลงชื่อ ....................................................")
	f.SetCellValue(sheet1, fmt.Sprintf("%s%d", getColName(lastCol), sigRow+1), "( .................................................... )")
	f.SetCellValue(sheet1, fmt.Sprintf("%s%d", getColName(lastCol), sigRow+2), "ผู้อนุมัติ / หัวหน้ากลุ่มงานการพยาบาล")

	// Freeze Panes
	_ = f.SetPanes(sheet1, &excelize.Panes{
		Freeze:      true,
		Split:       false,
		XSplit:      3,
		YSplit:      4,
		TopLeftCell: "D5",
		ActivePane:  "bottomRight",
	})

	// Set column widths
	f.SetColWidth(sheet1, "A", "A", 6)
	f.SetColWidth(sheet1, "B", "B", 24)
	f.SetColWidth(sheet1, "C", "C", 10)
	for d := 1; d <= daysInMonth; d++ {
		colName, _ := excelize.ColumnNumberToName(3 + d)
		f.SetColWidth(sheet1, colName, colName, 7)
	}
	for idx := 0; idx < len(sumCols); idx++ {
		colName, _ := excelize.ColumnNumberToName(sumColStart + idx)
		f.SetColWidth(sheet1, colName, colName, 13)
	}

	// ==================== SHEET 2: สรุปภาระงาน ====================
	f.SetCellValue(sheet2, "A1", fmt.Sprintf("สรุปภาระงานและความเท่าเทียม — %s (%s พ.ศ. %d)", r.WardID, monthName, buddhistYear))
	f.SetCellStyle(sheet2, "A1", "A1", titleStyle)

	workloadHeaders := []string{"ลำดับ", "ชื่อ - นามสกุล", "ตำแหน่ง", "ชั่วโมงตามแผน", "เป้าหมาย (ชม.)", "ส่วนต่าง (ชม.)", "วันทำงาน", "วันหยุด (X)", "วันลา (L)", "เวรควบ", "เวรดึก (ชม.)", "จำนวนเวรดึก", "ยกมา (ชม.)", "ล้ำไป (ชม.)"}
	for idx, wh := range workloadHeaders {
		colName, _ := excelize.ColumnNumberToName(idx + 1)
		f.SetCellValue(sheet2, fmt.Sprintf("%s3", colName), wh)
		f.SetCellStyle(sheet2, fmt.Sprintf("%s3", colName), fmt.Sprintf("%s3", colName), headerStyle)
	}

	wRow := 4
	for idx, ns := range summary.NurseStats {
		f.SetCellValue(sheet2, fmt.Sprintf("A%d", wRow), idx+1)
		f.SetCellValue(sheet2, fmt.Sprintf("B%d", wRow), ns.NurseName)
		f.SetCellValue(sheet2, fmt.Sprintf("C%d", wRow), ns.Position)
		f.SetCellValue(sheet2, fmt.Sprintf("D%d", wRow), ns.PlannedHours)
		f.SetCellValue(sheet2, fmt.Sprintf("E%d", wRow), ns.TargetHours)
		f.SetCellValue(sheet2, fmt.Sprintf("F%d", wRow), ns.VarianceHours)
		f.SetCellValue(sheet2, fmt.Sprintf("G%d", wRow), ns.WorkDays)
		f.SetCellValue(sheet2, fmt.Sprintf("H%d", wRow), ns.OffDays)
		f.SetCellValue(sheet2, fmt.Sprintf("I%d", wRow), ns.LeaveDays)
		f.SetCellValue(sheet2, fmt.Sprintf("J%d", wRow), ns.DoubleShifts)
		f.SetCellValue(sheet2, fmt.Sprintf("K%d", wRow), ns.NightHours)
		f.SetCellValue(sheet2, fmt.Sprintf("L%d", wRow), ns.NightShifts)
		f.SetCellValue(sheet2, fmt.Sprintf("M%d", wRow), ns.CarryInHours)
		f.SetCellValue(sheet2, fmt.Sprintf("N%d", wRow), ns.CarryOutHours)

		f.SetCellStyle(sheet2, fmt.Sprintf("A%d", wRow), fmt.Sprintf("A%d", wRow), cellCenterStyle)
		f.SetCellStyle(sheet2, fmt.Sprintf("B%d", wRow), fmt.Sprintf("B%d", wRow), cellLeftStyle)
		for c := 3; c <= 14; c++ {
			cName, _ := excelize.ColumnNumberToName(c)
			f.SetCellStyle(sheet2, fmt.Sprintf("%s%d", cName, wRow), fmt.Sprintf("%s%d", cName, wRow), cellCenterStyle)
		}
		wRow++
	}

	// Totals row in sheet 2
	f.SetCellValue(sheet2, fmt.Sprintf("B%d", wRow), "รวมทั้งสิ้น")
	f.SetCellValue(sheet2, fmt.Sprintf("D%d", wRow), summary.Totals.TotalPlannedHours)
	f.SetCellValue(sheet2, fmt.Sprintf("G%d", wRow), summary.Totals.TotalWorkShifts)
	f.SetCellValue(sheet2, fmt.Sprintf("J%d", wRow), summary.Totals.TotalDoubleShifts)
	f.SetCellValue(sheet2, fmt.Sprintf("K%d", wRow), summary.Totals.TotalNightHours)
	for c := 1; c <= 14; c++ {
		cName, _ := excelize.ColumnNumberToName(c)
		f.SetCellStyle(sheet2, fmt.Sprintf("%s%d", cName, wRow), fmt.Sprintf("%s%d", cName, wRow), cellBoldCenterStyle)
	}

	for c := 1; c <= 14; c++ {
		cName, _ := excelize.ColumnNumberToName(c)
		f.SetColWidth(sheet2, cName, cName, 14)
	}
	f.SetColWidth(sheet2, "B", "B", 24)

	// ==================== SHEET 3: ข้อผิดพลาดและคำเตือน ====================
	f.SetCellValue(sheet3, "A1", fmt.Sprintf("รายงานข้อผิดพลาดและคำเตือน (Violations) — %s (%s พ.ศ. %d)", r.WardID, monthName, buddhistYear))
	f.SetCellStyle(sheet3, "A1", "A1", titleStyle)

	vHeaders := []string{"ลำดับ", "ระดับ", "รหัสกฎ", "วันที่", "เวร", "บุคลากร", "คำอธิบาย / รายละเอียด"}
	for idx, vh := range vHeaders {
		colName, _ := excelize.ColumnNumberToName(idx + 1)
		f.SetCellValue(sheet3, fmt.Sprintf("%s3", colName), vh)
		f.SetCellStyle(sheet3, fmt.Sprintf("%s3", colName), fmt.Sprintf("%s3", colName), headerStyle)
	}

	vRow := 4
	if len(summary.Violations) == 0 {
		f.SetCellValue(sheet3, "A4", "✓ ไม่พบข้อผิดพลาดหรือคำเตือนในตารางนี้")
		f.SetCellStyle(sheet3, "A4", "G4", cellLeftStyle)
	} else {
		for idx, v := range summary.Violations {
			sevText := "⚠️ คำเตือน (Warning)"
			if v.Severity == "error" {
				sevText = "⛔ ข้อบังคับ (Error)"
			}
			f.SetCellValue(sheet3, fmt.Sprintf("A%d", vRow), idx+1)
			f.SetCellValue(sheet3, fmt.Sprintf("B%d", vRow), sevText)
			f.SetCellValue(sheet3, fmt.Sprintf("C%d", vRow), v.RuleCode)
			f.SetCellValue(sheet3, fmt.Sprintf("D%d", vRow), v.Date)
			f.SetCellValue(sheet3, fmt.Sprintf("E%d", vRow), v.ShiftCode)
			f.SetCellValue(sheet3, fmt.Sprintf("F%d", vRow), v.SubjectID)
			f.SetCellValue(sheet3, fmt.Sprintf("G%d", vRow), v.Message)

			f.SetCellStyle(sheet3, fmt.Sprintf("A%d", vRow), fmt.Sprintf("A%d", vRow), cellCenterStyle)
			f.SetCellStyle(sheet3, fmt.Sprintf("B%d", vRow), fmt.Sprintf("B%d", vRow), cellCenterStyle)
			f.SetCellStyle(sheet3, fmt.Sprintf("C%d", vRow), fmt.Sprintf("C%d", vRow), cellCenterStyle)
			f.SetCellStyle(sheet3, fmt.Sprintf("D%d", vRow), fmt.Sprintf("D%d", vRow), cellCenterStyle)
			f.SetCellStyle(sheet3, fmt.Sprintf("E%d", vRow), fmt.Sprintf("E%d", vRow), cellCenterStyle)
			f.SetCellStyle(sheet3, fmt.Sprintf("F%d", vRow), fmt.Sprintf("F%d", vRow), cellCenterStyle)
			f.SetCellStyle(sheet3, fmt.Sprintf("G%d", vRow), fmt.Sprintf("G%d", vRow), cellLeftStyle)
			vRow++
		}
	}

	f.SetColWidth(sheet3, "A", "A", 8)
	f.SetColWidth(sheet3, "B", "B", 20)
	f.SetColWidth(sheet3, "C", "C", 22)
	f.SetColWidth(sheet3, "D", "D", 12)
	f.SetColWidth(sheet3, "E", "E", 8)
	f.SetColWidth(sheet3, "F", "F", 16)
	f.SetColWidth(sheet3, "G", "G", 50)

	buf, err := f.WriteToBuffer()
	if err != nil {
		return nil, fmt.Errorf("write excel buffer: %w", err)
	}
	return buf.Bytes(), nil
}

func getColName(col int) string {
	name, _ := excelize.ColumnNumberToName(col)
	return name
}

