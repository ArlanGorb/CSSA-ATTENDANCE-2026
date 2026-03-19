# Analytics Dashboard - Presensi CSSA

## Overview
The Analytics Dashboard provides comprehensive insights into attendance patterns, division performance, and meeting statistics with advanced data visualization and export capabilities.

**Path:** `/analytics`
**Access:** Public (can be restricted via admin authentication if needed)

## Features

### 1. Key Metrics Dashboard
Real-time overview cards showing:
- **Total Meetings**: Count of meetings in selected time range
- **Average Attendance**: Mean attendance per meeting
- **Late Rate**: Percentage of late arrivals
- **Absence Rate**: Percentage of absences (Izin + Sakit + Alfa)

### 2. Time Range Filtering
Filter data by:
- **Last 7 days**: Quick view of recent activity
- **Last 30 days**: Monthly overview
- **Last 90 days**: Quarterly analysis
- **All time**: Complete historical data

### 3. Division Filter
Filter analytics by specific division:
- Officer
- Kerohanian
- Mulmed
- Senat Angkatan
- Olahraga
- Humas
- Keamanan
- Pendidikan
- Parlemanterian

### 4. Interactive Charts

#### Attendance Trend (Area Chart)
- Shows total attendance and hadir count over time
- Gradient fill for visual appeal
- Hover tooltips for exact values
- Dual-line comparison (Total vs Hadir)

#### Status Distribution (Pie Chart)
- Overall breakdown of attendance statuses
- Percentage labels on segments
- Color-coded: Hadir (Green), Late (Yellow), Izin (Blue), Sakit (Purple), Alfa (Red)
- Inner donut design for modern look

#### Division Performance (Horizontal Bar Chart)
- Compares attendance rates across divisions
- Three metrics per division: Hadir %, Late %, Absence %
- Sorted by highest hadir rate
- Interactive legend for filtering

#### Meeting Performance (Bar Chart)
- Shows attendance rate for each meeting
- Top 10 meetings displayed
- Angled labels for readability
- Color-coded by performance threshold

### 5. Smart Insights
Automatically generated insights based on data:

**Success Insights** (Green):
- Best performing meeting (highest attendance rate)
- Top division (best attendance)
- Positive attendance trends (>10% improvement)

**Warning Insights** (Yellow):
- High absence rate alerts (>20%)
- Declining attendance trends
- Areas requiring attention

### 6. Detailed Data Table
Comprehensive meeting details including:
- Meeting name and date
- Total attendance count
- Breakdown by status (Hadir, Late, Izin, Sakit, Alfa)
- Attendance rate with color-coded badges
- Sortable columns
- Hover effects for readability

### 7. Data Export

#### PDF Export
Generates professional PDF report containing:
- Report header with generation timestamp
- Overall statistics summary
- Meeting performance table (top 10)
- Division performance table
- Formatted with colors and styling

**Features:**
- Automatic page breaks
- Professional table styling
- Color-coded headers
- Optimized for A4 printing

**Filename:** `CSSA_Analytics_Report_YYYYMMDD.pdf`

#### CSV Export
Downloads two CSV files:

**1. Meeting Stats (`meeting_stats_YYYYMMDD.csv`):**
```
Meeting,Date,Total Attendance,Hadir,Late,Izin,Sakit,Alfa,Attendance Rate
Fall General Meeting,2026-03-15,45,38,5,1,1,0,95%
```

**2. Division Stats (`division_stats_YYYYMMDD.csv`):**
```
Division,Total Members,Total Attendance,Avg Attendance,Hadir Rate,Late Rate,Absence Rate
Officer,8,120,15,92%,5%,3%
```

**Features:**
- Excel-compatible format
- All time range data included
- Proper CSV escaping
- UTF-8 encoding

## Technical Implementation

### Dependencies
```json
{
  "recharts": "^3.8.0",
  "date-fns": "^3.3.1",
  "jspdf": "^4.2.0",
  "jspdf-autotable": "^5.0.7"
}
```

### Data Structure

#### MeetingStats Interface
```typescript
interface MeetingStats {
  id: string;
  title: string;
  date: string;
  totalAttendance: number;
  hadir: number;
  late: number;
  izin: number;
  sakit: number;
  alfa: number;
  attendanceRate: number;
}
```

#### DivisionStats Interface
```typescript
interface DivisionStats {
  division: string;
  totalMembers: number;
  totalAttendance: number;
  averageAttendance: number;
  hadirRate: number;
  lateRate: number;
  absenceRate: number;
}
```

### API Calls
Uses Supabase client for data fetching:

1. **Meeting Stats**: Fetches meetings with nested attendance data
2. **Division Stats**: Aggregates attendance by division
3. **Time Series**: Chronological meeting data for trends
4. **Overall Stats**: Summary metrics

### Performance Optimizations
- Parallel data fetching with `Promise.all()`
- Client-side caching via React state
- Efficient chart rendering with ResponsiveContainer
- Memoized calculations for insights

## Usage Guide

### For Admins
1. Navigate to `/analytics` from admin dashboard
2. Select time range from top-right filter
3. Optionally filter by specific division
4. Review insights and charts
5. Export PDF report for presentations
6. Download CSV for further analysis in Excel

### For Members
1. Access via home page "Analytics Dashboard" card
2. View overall statistics (no sensitive data exposed)
3. Understand attendance patterns
4. Compare division performance

## Color Scheme

| Status | Color | Hex Code |
|--------|-------|----------|
| Hadir | Green | `#22c55e` |
| Late | Yellow | `#eab308` |
| Izin | Blue | `#3b82f6` |
| Sakit | Purple | `#a855f7` |
| Alfa | Red | `#ef4444` |
| Primary | Blue | `#3b82f6` |
| Secondary | Purple | `#8b5cf6` |

## Responsive Design

### Desktop (≥1024px)
- 4-column metrics grid
- 2-column charts layout
- Full-width data table
- All filters visible

### Tablet (768px - 1023px)
- 2-column metrics grid
- 1-column charts layout
- Scrollable table
- Compact filters

### Mobile (<768px)
- 1-column metrics grid
- 1-column charts layout
- Horizontal table scroll
- Stacked filters

## Future Enhancements

### Planned Features
1. **Custom Date Range Picker**
   - Select start and end dates
   - Preset ranges (This Month, Last Quarter, etc.)

2. **Advanced Filtering**
   - Multiple division selection
   - Status-specific filtering
   - Meeting type filtering

3. **Predictive Analytics**
   - Attendance forecasting
   - Trend predictions
   - Anomaly detection

4. **Real-time Updates**
   - Live attendance tracking
   - WebSocket integration
   - Auto-refresh charts

5. **Comparison Mode**
   - Year-over-year comparison
   - Meeting-to-meeting comparison
   - Division benchmarking

6. **Additional Exports**
   - Excel (XLSX) format
   - PNG chart exports
   - Scheduled email reports

7. **Custom Dashboards**
   - Widget-based layout
   - Save custom views
   - Share dashboards

## Security Considerations

### Current Implementation
- Open access (public data only)
- No sensitive personal information exposed
- Aggregated data only

### Recommended for Production
- Add admin authentication check
- Rate limiting on export functions
- Audit log for report generation
- Data access logging

## Troubleshooting

### Common Issues

**Charts not rendering:**
- Check Recharts library installation
- Verify data format matches expected structure
- Ensure container has defined height

**Export not working:**
- Check browser popup blocker settings
- Verify jsPDF imports
- Ensure data is loaded before export

**Slow performance:**
- Reduce time range for large datasets
- Check network latency to Supabase
- Consider server-side aggregation

## Testing Checklist

- [ ] Metrics display correct values
- [ ] Time range filter updates all charts
- [ ] Division filter works correctly
- [ ] All charts render properly
- [ ] Tooltips show accurate data
- [ ] PDF export generates valid file
- [ ] CSV export opens in Excel
- [ ] Insights are relevant and accurate
- [ ] Responsive design works on all devices
- [ ] Loading states display correctly
- [ ] Error states are handled gracefully

## File Structure
```
src/app/
├── analytics/
│   └── page.tsx          # Main analytics dashboard
├── admin/
│   └── page.tsx          # Updated with analytics link
└── page.tsx              # Home page with analytics card
```

## Build Status
✅ Build successful - No errors
⚠️ Minor ESLint warnings (non-critical React Hook dependencies)

---
**Version:** 1.0.0
**Last Updated:** March 2026
**Author:** CSSA Development Team
