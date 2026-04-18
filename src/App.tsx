import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import { 
  FileSpreadsheet, BarChart3, Users, BookOpen, Settings, 
  Upload, CheckCircle2, AlertCircle, LogOut, ChevronRight,
  Search, Filter, Download, Trash2, LayoutDashboard, Trophy, Layout
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { db } from './firebase';
import { 
  collection, addDoc, getDocs, query, where, deleteDoc, 
  doc, setDoc, getDoc, writeBatch, onSnapshot, orderBy 
} from 'firebase/firestore';
import { cn } from './lib/utils';

// Types
interface Student {
  id?: string;
  tt: number;
  sbd: string;
  name: string;
  class: string;
  scores: Record<string, any>;
  total: number;
}

interface AppConfig {
  hasData: boolean;
  lastImport: string | null;
}

const ADMIN_CODE = "487060";
const VIEWER_CODE = "111111";

const SUBJECTS = [
  "Văn", "Toán", "Lý", "Hóa", "Sinh", "Tin", 
  "Sử", "Địa", "KTPL", "Anh"
];

const SCHOOL_NAME_MAP: Record<string, string> = {
  "CUM": "CỤM CHUYÊN MÔN",
  "ND": "NGUYỄN DU",
  "TĐT": "TÔN ĐỨC THẮNG",
  "VVK": "VÕ VĂN KIỆT",
  "PVĐ": "PHẠM VĂN ĐỒNG",
  "LHP": "LÊ HỒNG PHONG",
  "NTMK": "NGUYỄN THỊ MINH KHAI",
  "TQT": "TRẦN QUỐC TUẤN",
  "TS": "TRẦN SUYỀN",
  "TBT": "TRẦN BÌNH TRỌNG",
  "NBN": "NGUYỄN BÁ NGỌC",
  "PBC": "PHAN BỘI CHÂU"
};

const getDisplayName = (name: string) => SCHOOL_NAME_MAP[name] || name;

const DATA_COLUMNS = [
  "TT", "SBD", "Họ và tên", "Lớp", 
  "Văn", "Toán", "Lý", "Hóa", "Sinh", "Tin", 
  "Sử", "Địa", "KTPL", "Anh",
  "TB THI", "ĐTB 10", "ĐTB 11", "ĐTB 12", "ĐTB HT", "XÉT TN", "KQ"
];

const formatScore = (val: any) => {
  if (val === undefined || val === null || val === "") return "";
  const num = parseFloat(val);
  if (isNaN(num)) return val;
  if (num === 0) return "";
  return num.toFixed(2);
};

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#6366f1'];

export default function App() {
  const [authCode, setAuthCode] = useState<string>("");
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
  const [role, setRole] = useState<'admin' | 'viewer' | null>(null);
  const [activeTab, setActiveTab] = useState<string>("data");
  const [students, setStudents] = useState<Student[]>([]);
  const [config, setConfig] = useState<AppConfig>({ hasData: false, lastImport: null });
  const [loading, setLoading] = useState<boolean>(true);
  const [importing, setImporting] = useState<boolean>(false);
  const [tempData, setTempData] = useState<Student[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>("");
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [assessment, setAssessment] = useState<string>("");
  const [loadingAssessment, setLoadingAssessment] = useState<boolean>(false);
  const [rewardsState, setRewardsState] = useState<Record<string, { amount: number, selected: boolean }>>({});
  const [savingRewards, setSavingRewards] = useState<boolean>(false);

  // Group Comparison state
  const [groupData, setGroupData] = useState<{ 
    schools: string[], 
    metrics: { label: string, values: any[] }[]
  } | null>(null);
  const [selectedSchoolIdx, setSelectedSchoolIdx] = useState<number>(-1);
  const [tempGroupData, setTempGroupData] = useState<{ 
    schools: string[], 
    metrics: { label: string, values: any[] }[],
    details?: Record<string, string>
  } | null>(null);
  const [activeSchoolDetail, setActiveSchoolDetail] = useState<any[][] | null>(null);
  const [pvdSchoolDetail, setPvdSchoolDetail] = useState<any[][] | null>(null);
  const [loadingSchoolDetail, setLoadingSchoolDetail] = useState<boolean>(false);
  const [updatingGroup, setUpdatingGroup] = useState<boolean>(false);

  // Comparison History state
  const [comparisonData, setComparisonData] = useState<any[]>([]);
  const [tempComparisonData, setTempComparisonData] = useState<any[] | null>(null);
  const [updatingComparison, setUpdatingComparison] = useState<boolean>(false);

  useEffect(() => {
    const fetchPvdAlways = async () => {
      if (!pvdSchoolDetail) {
        try {
          const pvdRef = doc(db, "group_details", "PVĐ");
          const pvdSnap = await getDoc(pvdRef);
          if (pvdSnap.exists()) {
            const pvdData = pvdSnap.data();
            if (pvdData.data) {
              setPvdSchoolDetail(JSON.parse(pvdData.data));
            }
          }
        } catch (err) {
          console.error("Error fetching initial PVD details:", err);
        }
      }
    };
    fetchPvdAlways();
  }, []);

  useEffect(() => {
    if (selectedSchoolIdx !== -1 && groupData) {
      const schoolName = groupData.schools[selectedSchoolIdx];
      
      const fetchDetails = async () => {
        setLoadingSchoolDetail(true);
        setActiveSchoolDetail(null);
        try {
          // Fetch selected school detail
          const docRef = doc(db, "group_details", schoolName);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.data) {
              setActiveSchoolDetail(JSON.parse(data.data));
            }
          }

          // Also fetch PVD detail if not already loaded or if it's the target
          if (!pvdSchoolDetail || schoolName !== 'PVĐ') {
            const pvdRef = doc(db, "group_details", "PVĐ");
            const pvdSnap = await getDoc(pvdRef);
            if (pvdSnap.exists()) {
              const pvdData = pvdSnap.data();
              if (pvdData.data) {
                setPvdSchoolDetail(JSON.parse(pvdData.data));
              }
            }
          }
        } catch (err) {
          console.error("Error fetching school details:", err);
        } finally {
          setLoadingSchoolDetail(false);
        }
      };
      fetchDetails();
    } else {
      setActiveSchoolDetail(null);
    }
  }, [selectedSchoolIdx, groupData]);

  // Auth Logic
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (authCode === ADMIN_CODE) {
      setIsAuthorized(true);
      setRole('admin');
      setActiveTab('data');
      localStorage.setItem('thpt_auth', JSON.stringify({ code: authCode, role: 'admin' }));
    } else if (authCode === VIEWER_CODE) {
      setIsAuthorized(true);
      setRole('viewer');
      setActiveTab('school');
      localStorage.setItem('thpt_auth', JSON.stringify({ code: authCode, role: 'viewer' }));
    } else {
      alert("Mã xác nhận không đúng!");
    }
  };

  const handleLogout = () => {
    setIsAuthorized(false);
    setRole(null);
    setAuthCode("");
    localStorage.removeItem('thpt_auth');
  };

  useEffect(() => {
    const savedAuth = localStorage.getItem('thpt_auth');
    if (savedAuth) {
      const { code, role } = JSON.parse(savedAuth);
      setAuthCode(code);
      setIsAuthorized(true);
      setRole(role);
      setActiveTab(role === 'admin' ? 'data' : 'school');
    }

    // Fetch config and data
    const unsubscribeConfig = onSnapshot(doc(db, "config", "app"), (snapshot) => {
      if (snapshot.exists()) {
        setConfig(snapshot.data() as AppConfig);
      } else {
        // Initialize config if not exists
        setDoc(doc(db, "config", "app"), { hasData: false, lastImport: null });
      }
    });

    const unsubscribeStudents = onSnapshot(query(collection(db, "students"), orderBy("sbd", "asc")), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
      setStudents(data);
      setLoading(false);
    });

    const unsubscribeRewards = onSnapshot(doc(db, "config", "rewards"), (snapshot) => {
      if (snapshot.exists()) {
        setRewardsState(snapshot.data() as any);
      }
    });

    const unsubscribeGroup = onSnapshot(doc(db, "group_data", "latest"), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setGroupData({
          schools: data.schools || [],
          metrics: data.metrics || []
        });
      }
    });

    const unsubscribeComparison = onSnapshot(doc(db, "comparison_data", "latest"), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setComparisonData(data.data || []);
      }
    });

    return () => {
      unsubscribeConfig();
      unsubscribeStudents();
      unsubscribeRewards();
      unsubscribeGroup();
      unsubscribeComparison();
    };
  }, []);

  // Data Import Logic
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws) as any[];

      const mappedData: Student[] = data.map((row, index) => {
        const scores: Record<string, any> = {};
        
        // Map subjects
        const subjectMapping: Record<string, string> = {
          "Văn": "Văn",
          "Ngữ văn": "Văn",
          "Toán": "Toán",
          "Lý": "Lý",
          "Vật lí": "Lý",
          "Hóa": "Hóa",
          "Hóa học": "Hóa",
          "Sinh": "Sinh",
          "Sinh học": "Sinh",
          "Tin": "Tin",
          "Tin học": "Tin",
          "Sử": "Sử",
          "Lịch sử": "Sử",
          "Địa": "Địa",
          "Địa lí": "Địa",
          "KTPL": "KTPL",
          "GD kinh tế & Pháp luật": "KTPL",
          "Anh": "Anh",
          "Tiếng Anh": "Anh"
        };

        SUBJECTS.forEach(sub => {
          const possibleNames = Object.keys(subjectMapping).filter(k => subjectMapping[k] === sub);
          let value = 0;
          for (const name of possibleNames) {
            if (row[name] !== undefined) {
              value = parseFloat(row[name]);
              break;
            }
          }
          scores[sub] = value || 0;
        });

        const extraFields = ["TB THI", "ĐTB 10", "ĐTB 11", "ĐTB 12", "ĐTB HT", "XÉT TN", "KQ"];
        extraFields.forEach(key => {
          scores[key] = row[key] || row[key.toLowerCase()] || "";
        });
        
        const total = parseFloat(scores["TB THI"] || 0);

        return {
          tt: index + 1,
          sbd: String(row['SBD'] || row['sbd'] || `ST${index}`),
          name: row['Họ và tên'] || row['Họ tên'] || row['name'] || 'N/A',
          class: row['Lớp'] || row['class'] || 'N/A',
          scores,
          total
        };
      }).sort((a, b) => a.sbd.localeCompare(b.sbd, undefined, { numeric: true }));

      setTempData(mappedData);
    };
    reader.readAsBinaryString(file);
  };

  const handleUpdateData = async () => {
    if (tempData.length === 0) return;
    setImporting(true);
    try {
      const batch = writeBatch(db);
      
      const snapshot = await getDocs(collection(db, "students"));
      snapshot.docs.forEach(d => batch.delete(d.ref));

      tempData.forEach(student => {
        const newDocRef = doc(collection(db, "students"));
        batch.set(newDocRef, student);
      });

      await batch.commit();
      await setDoc(doc(db, "config", "app"), {
        hasData: true,
        lastImport: new Date().toISOString()
      });

      setTempData([]);
      alert("Cập nhật dữ liệu thành công!");
    } catch (error) {
      console.error(error);
      alert("Lỗi khi cập nhật dữ liệu!");
    } finally {
      setImporting(false);
    }
  };

  // Stats Calculations
  const stats = useMemo(() => {
    if (students.length === 0) return null;

    const totalStudents = students.length;
    const absentList = students.filter(s => String(s.scores["TB THI"]).toUpperCase() === "X");
    const absentCount = absentList.length;
    const participatedCount = totalStudents - absentCount;
    
    const passedList = students.filter(s => String(s.scores["KQ"]).includes("Đ"));
    const failedList = students.filter(s => String(s.scores["KQ"]).includes("H"));
    
    const passRate = (passedList.length / (participatedCount || 1)) * 100;
    const failRate = (failedList.length / (participatedCount || 1)) * 100;

    const schoolAvg = students.reduce((acc, s) => acc + (parseFloat(s.scores["TB THI"]) || 0), 0) / (participatedCount || 1);
    
    const subjectStats = SUBJECTS.map(sub => {
      const validScores = students.map(s => s.scores[sub]).filter(score => typeof score === 'number' && score > 0);
      const avg = validScores.length > 0 ? validScores.reduce((a, b) => a + b, 0) / validScores.length : 0;
      return { name: sub, avg: parseFloat(avg.toFixed(2)) };
    });

    const detailedSubjectStats = SUBJECTS.map(sub => {
      const allScores = students.map(s => {
        const score = parseFloat(String(s.scores[sub]).replace(',', '.'));
        return isNaN(score) ? -1 : score;
      });
      
      const participatedScores = allScores.filter(s => s > 0);
      const participated = participatedScores.length;
      
      const liet = participatedScores.filter(s => s <= 1).length;
      const zeroToTwo = participatedScores.filter(s => s <= 2).length;
      const belowAvg = participatedScores.filter(s => s < 5).length;
      const aboveAvg = participatedScores.filter(s => s >= 5).length;
      
      return {
        name: sub,
        participated,
        liet,
        lietRate: (liet / (participated || 1)) * 100,
        zeroToTwo,
        zeroToTwoRate: (zeroToTwo / (participated || 1)) * 100,
        belowAvg,
        belowAvgRate: (belowAvg / (participated || 1)) * 100,
        aboveAvg,
        aboveAvgRate: (aboveAvg / (participated || 1)) * 100
      };
    });

    const classStats = Array.from(new Set(students.map(s => s.class))).map(cls => {
      const classStudents = students.filter(s => s.class === cls);
      const validClassStudents = classStudents.filter(s => String(s.scores["TB THI"]).toUpperCase() !== "X");
      const avg = validClassStudents.reduce((acc, s) => acc + (parseFloat(s.scores["TB THI"]) || 0), 0) / (validClassStudents.length || 1);
      return { name: cls, avg: parseFloat(avg.toFixed(2)), count: classStudents.length };
    });

    return { 
      totalStudents, participatedCount, absentCount, absentList, 
      passedList, failedList, passRate, failRate,
      schoolAvg, subjectStats, detailedSubjectStats, classStats 
    };
  }, [students]);

  // Statistical Helpers
  const calculateSubjectDetailedStats = useMemo(() => {
    if (!selectedSubject || students.length === 0) return null;

    const subjectScores = students
      .map(s => {
        const score = parseFloat(String(s.scores[selectedSubject]).replace(',', '.'));
        return { sbd: s.sbd, name: s.name, class: s.class, score };
      })
      .filter(s => s.score > 0); // Only participants (score > 0)

    const scoresOnly = subjectScores.map(s => s.score);
    const total = subjectScores.length;

    if (total === 0) return null;

    // Basic Metrics
    const liet = subjectScores.filter(s => s.score <= 1).length;
    const zeroToTwo = subjectScores.filter(s => s.score <= 2).length;
    const belowAvg = subjectScores.filter(s => s.score < 5).length;
    const aboveAvg = subjectScores.filter(s => s.score >= 5).length;

    // Ranges for Table
    const ranges = [
      { label: "0-3.4", min: 0, max: 3.49 },
      { label: "3.5-4.9", min: 3.5, max: 4.99 },
      { label: "5.0-6.4", min: 5, max: 6.49 },
      { label: "6.5-7.9", min: 6.5, max: 7.99 },
      { label: "8.0-10", min: 8, max: 10 }
    ];

    const classes = Array.from(new Set(students.map(s => s.class))).sort();
    const classData = classes.map(cls => {
      const clsScores = subjectScores.filter(s => s.class === cls).map(s => s.score);
      const classTotal = clsScores.length;
      const rangeStats = ranges.map(r => {
        const count = clsScores.filter(s => s >= r.min && s <= r.max).length;
        return { count, rate: classTotal > 0 ? (count / classTotal) * 100 : 0 };
      });
      const aboveFiveCount = clsScores.filter(s => s >= 5).length;
      return { 
        className: cls, 
        total: classTotal, 
        stats: rangeStats,
        aboveFive: { count: aboveFiveCount, rate: classTotal > 0 ? (aboveFiveCount / classTotal) * 100 : 0 }
      };
    });

    const totalRangeStats = ranges.map(r => {
      const count = scoresOnly.filter(s => s >= r.min && s <= r.max).length;
      return { count, rate: total > 0 ? (count / total) * 100 : 0 };
    });

    const totalAboveFiveCount = scoresOnly.filter(s => s >= 5).length;
    const totalAboveFiveRate = total > 0 ? (totalAboveFiveCount / total) * 100 : 0;

    // Histogram data (0-10, 0.25 steps)
    const histogram = Array.from({ length: 41 }, (_, i) => {
      const val = i * 0.25;
      const count = scoresOnly.filter(s => s === val).length;
      return { name: val.toFixed(2), count };
    });

    // Advanced Stats
    const avg = scoresOnly.reduce((a, b) => a + b, 0) / total;
    const sortedScores = [...scoresOnly].sort((a, b) => a - b);
    const median = total % 2 !== 0 ? sortedScores[Math.floor(total / 2)] : (sortedScores[total / 2 - 1] + sortedScores[total / 2]) / 2;
    const stdDev = Math.sqrt(scoresOnly.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / total);
    const count10 = scoresOnly.filter(s => s === 10).length;
    const count0 = students.filter(s => {
      const v = parseFloat(String(s.scores[selectedSubject]).replace(',', '.'));
      return v === 0;
    }).length; // Special case: Count 0 regardless of participation filter

    // Top Students (Highest scores, top 5 but including ties)
    const sortedByScore = [...subjectScores].sort((a, b) => b.score - a.score);
    let topStudents = [];
    if (sortedByScore.length > 0) {
      // Find the score threshold (5th place score)
      const thresholdIndex = Math.min(4, sortedByScore.length - 1);
      const thresholdScore = sortedByScore[thresholdIndex].score;
      topStudents = sortedByScore.filter(s => s.score >= thresholdScore);
    }

    return {
      subject: selectedSubject,
      total,
      metrics: {
        liet, lietRate: (liet / total) * 100,
        zeroToTwo, zeroToTwoRate: (zeroToTwo / total) * 100,
        belowAvg, belowAvgRate: (belowAvg / total) * 100,
        aboveAvg, aboveAvgRate: (aboveAvg / total) * 100,
      },
      classData,
      totalRangeStats,
      totalAboveFive: { count: totalAboveFiveCount, rate: totalAboveFiveRate },
      ranges,
      histogram,
      topStudents,
      advanced: {
        avg: avg.toFixed(2),
        median: median.toFixed(2),
        stdDev: stdDev.toFixed(2),
        count10,
        count0
      }
    };
  }, [selectedSubject, students, stats]);

  const calculateClassDetailedStats = useMemo(() => {
    if (!selectedClass || students.length === 0) return null;

    const classStudents = students.filter(s => s.class === selectedClass);
    if (classStudents.length === 0) return null;

    // Aggregate metrics across ALL subjects for all students in the class
    let metrics = {
      totalScores: 0,
      liet: 0,
      zeroToTwo: 0,
      belowAvg: 0,
      aboveAvg: 0,
      duThi: 0,
      xetTN: 0,
      dauTN: 0,
      hongTN: 0
    };

    const ranges = [
      { label: "0-3.4", min: 0, max: 3.49 },
      { label: "3.5-4.9", min: 3.5, max: 4.99 },
      { label: "5.0-6.4", min: 5, max: 6.49 },
      { label: "6.5-7.9", min: 6.5, max: 7.99 },
      { label: "8.0-10", min: 8, max: 10 }
    ];

    // DỰ THI (based on TB THI exists and > 0)
    metrics.duThi = classStudents.filter(s => {
      const v = parseFloat(String(s.scores["TB THI"] || "").replace(',', '.'));
      return !isNaN(v) && v > 0;
    }).length;

    // Grad statistics
    metrics.xetTN = classStudents.filter(s => {
      const v = parseFloat(String(s.scores["XÉT TN"] || "").replace(',', '.'));
      return !isNaN(v) && v > 0;
    }).length;

    metrics.dauTN = classStudents.filter(s => {
      // Must have XÉT TN >= 5 AND no point of paralysis (<= 1) in any subject
      const xetTN = parseFloat(String(s.scores["XÉT TN"] || "").replace(',', '.'));
      if (isNaN(xetTN) || xetTN < 5) return false;

      const hasLiet = SUBJECTS.some(sub => {
        const val = parseFloat(String(s.scores[sub]).replace(',', '.'));
        return !isNaN(val) && val > 0 && val <= 1;
      });
      return !hasLiet;
    }).length;

    metrics.hongTN = classStudents.filter(s => {
      const xetTN = parseFloat(String(s.scores["XÉT TN"] || "").replace(',', '.'));
      const isValidXetTN = !isNaN(xetTN) && xetTN > 0;
      
      // Low score
      const isLowScore = isValidXetTN && xetTN < 5;
      
      // Point of paralysis
      const hasLiet = SUBJECTS.some(sub => {
        const val = parseFloat(String(s.scores[sub]).replace(',', '.'));
        return !isNaN(val) && val > 0 && val <= 1;
      });

      return isLowScore || hasLiet;
    }).length;

    const failedGradStudents = classStudents.filter(s => {
      const xetTN = parseFloat(String(s.scores["XÉT TN"] || "").replace(',', '.'));
      const isValidXetTN = !isNaN(xetTN) && xetTN > 0;
      const isLowScore = isValidXetTN && xetTN < 5;
      const hasLiet = SUBJECTS.some(sub => {
        const val = parseFloat(String(s.scores[sub]).replace(',', '.'));
        return !isNaN(val) && val > 0 && val <= 1;
      });
      return isLowScore || hasLiet;
    });

    const subjectStats = SUBJECTS.map(sub => {
      const subScores = classStudents
        .map(s => {
          const score = parseFloat(String(s.scores[sub] || "").replace(',', '.'));
          return score;
        })
        .filter(score => !isNaN(score) && score > 0);

      const subTotal = subScores.length;

      metrics.totalScores += subTotal;
      metrics.liet += subScores.filter(s => s <= 1).length;
      metrics.zeroToTwo += subScores.filter(s => s <= 2).length;
      metrics.belowAvg += subScores.filter(s => s < 5).length;
      metrics.aboveAvg += subScores.filter(s => s >= 5).length;

      const rangeStats = ranges.map(r => {
        const count = subScores.filter(s => s >= r.min && s <= r.max).length;
        return { count, rate: subTotal > 0 ? (count / subTotal) * 100 : 0 };
      });

      const aboveFiveCount = subScores.filter(s => s >= 5).length;

      return { 
        subject: sub, 
        total: subTotal, 
        stats: rangeStats,
        aboveFive: { count: aboveFiveCount, rate: subTotal > 0 ? (aboveFiveCount / subTotal) * 100 : 0 }
      };
    });

    // Top 5 Students by Average Score (TB THI)
    const sortedByAvg = [...classStudents]
      .map(s => {
        const avgScore = parseFloat(String(s.scores["TB THI"] || "").replace(',', '.'));
        return { ...s, avgScore: isNaN(avgScore) ? 0 : avgScore };
      })
      .filter(s => s.avgScore > 0)
      .sort((a, b) => b.avgScore - a.avgScore);

    let topStudentsByAvg = [];
    if (sortedByAvg.length > 0) {
      const thresholdIndex = Math.min(4, sortedByAvg.length - 1);
      const thresholdScore = sortedByAvg[thresholdIndex].avgScore;
      topStudentsByAvg = sortedByAvg.filter(s => s.avgScore >= thresholdScore);
    }

    return {
      className: selectedClass,
      metrics: {
        ...metrics,
        lietRate: metrics.totalScores > 0 ? (metrics.liet / metrics.totalScores) * 100 : 0,
        zeroToTwoRate: metrics.totalScores > 0 ? (metrics.zeroToTwo / metrics.totalScores) * 100 : 0,
        belowAvgRate: metrics.totalScores > 0 ? (metrics.belowAvg / metrics.totalScores) * 100 : 0,
        aboveAvgRate: metrics.totalScores > 0 ? (metrics.aboveAvg / metrics.totalScores) * 100 : 0,
        dauTNRate: metrics.xetTN > 0 ? (metrics.dauTN / metrics.xetTN) * 100 : 0,
        hongTNRate: metrics.xetTN > 0 ? (metrics.hongTN / metrics.xetTN) * 100 : 0,
      },
      subjectStats,
      ranges,
      topStudentsByAvg,
      failedGradStudents
    };
  }, [selectedClass, students]);

  // AI Assessment Generator
  const generateAIAnalysis = async () => {
    if (!calculateSubjectDetailedStats) return;
    setLoadingAssessment(true);
    try {
      // @ts-ignore - Vite env variables
      const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
      
      if (!apiKey || apiKey === "undefined") {
        throw new Error("API Key chưa được cấu hình. Vui lòng kiểm tra VITE_GEMINI_API_KEY trong Environment Variables.");
      }

      const ai = new GoogleGenAI({ apiKey });
      const data = calculateSubjectDetailedStats;
      const prompt = `Bạn là chuyên gia phân tích dữ liệu giáo dục Việt Nam. Hãy đưa ra phân tích ngắn gọn về kết quả thi môn ${data.subject} dựa trên các số liệu sau:
      - Tổng dự thi (điểm > 0): ${data.total}
      - Điểm trung bình: ${data.advanced.avg}
      - Trung vị: ${data.advanced.median}
      - Độ lệch chuẩn: ${data.advanced.stdDev}
      - Tỷ lệ trên trung bình (>=5): ${data.metrics.aboveAvgRate.toFixed(1)}%
      
      Yêu cầu NGHIÊM NGẶT:
      1. CHỈ phân tích về Phổ điểm và Hình dáng Phân phối (ví dụ: phổ điểm có hình chuông, đỉnh lệch về phía điểm nào, sự phân hóa ra sao).
      2. Sử dụng ngôn ngữ đại chúng, phổ thông, gần gũi trong ngành giáo dục (ví dụ: "phổ điểm đẹp", "phân hóa tốt", "đỉnh rơi vào vùng điểm...", "phân khúc điểm khá", "vùng điểm trung bình...", "rốn điểm", "đỉnh điểm tập trung ở..."). Tránh dùng từ quá hàn lâm như "phân phối chuẩn hóa", "phương sai".
      3. Nội dung cực kỳ ngắn gọn (3-5 câu), trình bày thành một đoạn văn duy nhất.
      4. Tuyệt đối KHÔNG sử dụng ký hiệu dấu sao (*), ký hiệu thăng (#), hay các gạch đầu dòng, dấu chấm tròn, markdown.
      5. KHÔNG sử dụng định dạng in đậm/in nghiêng.
      6. KHÔNG đánh giá chất lượng dạy học, KHÔNG đưa ra lời khuyên, KHÔNG kết luận.
      7. Chỉ tập trung mô tả "bức tranh" điểm số một cách sinh động theo ngôn ngữ chuyên môn giáo dục phổ thông.`;

      // Cập nhật lại model tiêu chuẩn hơn
      const result = await (ai as any).models.generateContent({
        model: "gemini-1.5-flash", 
        contents: [{ role: "user", parts: [{ text: prompt }] }]
      });

      setAssessment(result.text || "Không thể tạo đánh giá lúc này.");
    } catch (error: any) {
      console.error(error);
      setAssessment(`Lỗi kết nối AI: ${error.message || "Kiểm tra lại khóa API hoặc kết nối mạng."}`);
    } finally {
      setLoadingAssessment(false);
    }
  };

  useEffect(() => {
    if (selectedSubject) {
      setAssessment("");
      // Automatically trigger analysis
      generateAIAnalysis();
    }
  }, [selectedSubject]);

  const calculateRewardsList = useMemo(() => {
    if (students.length === 0) return [];

    const list: any[] = [];
    
    // 1. Top 3 TB THI
    const studentsWithAvg = students
      .map(s => ({ ...s, avgScore: parseFloat(String(s.scores["TB THI"] || "").replace(',', '.')) }))
      .filter(s => !isNaN(s.avgScore) && s.avgScore > 0)
      .sort((a, b) => b.avgScore - a.avgScore);

    if (studentsWithAvg.length > 0) {
      const uniqueScores = Array.from(new Set(studentsWithAvg.map(s => s.avgScore))).slice(0, 3);
      uniqueScores.forEach((score, idx) => {
        const title = idx === 0 ? "Thủ khoa" : `Cao thứ ${idx + 1}`;
        studentsWithAvg.filter(s => s.avgScore === score).forEach(s => {
          list.push({
            sbd: s.sbd,
            name: s.name,
            class: s.class,
            score: s.avgScore,
            achievement: title,
            category: "TB_THI",
            catLabel: "TOÀN TRƯỜNG",
            colorClass: "bg-emerald-50 border-emerald-100 text-emerald-900"
          });
        });
      });
    }

    // 2. Top 5 each subject
    const subjectColors = [
      "bg-blue-50 border-blue-100 text-blue-900",
      "bg-indigo-50 border-indigo-100 text-indigo-900",
      "bg-violet-50 border-violet-100 text-violet-900",
      "bg-purple-50 border-purple-100 text-purple-900",
      "bg-fuchsia-50 border-fuchsia-100 text-fuchsia-900",
      "bg-pink-50 border-pink-100 text-pink-900",
      "bg-rose-50 border-rose-100 text-rose-900",
      "bg-orange-50 border-orange-100 text-orange-900",
      "bg-amber-50 border-amber-100 text-amber-900",
      "bg-yellow-50 border-yellow-100 text-yellow-900"
    ];

    SUBJECTS.forEach((sub, subIdx) => {
      const subScores = students
        .map(s => ({ ...s, subScore: parseFloat(String(s.scores[sub] || "").replace(',', '.')) }))
        .filter(s => !isNaN(s.subScore) && s.subScore > 0)
        .sort((a, b) => b.subScore - a.subScore);

      if (subScores.length > 0) {
        const uniqueScores = Array.from(new Set(subScores.map(s => s.subScore))).slice(0, 5);
        // We only take top 5 entries here (or more if ties)
        // Adjust uniqueScores to find the 5th place
        let count = 0;
        const topSubScores = [];
        for (const score of uniqueScores) {
          const matching = subScores.filter(s => s.subScore === score);
          topSubScores.push({ score, students: matching });
          count += matching.length;
          if (count >= 5) break; 
        }

        topSubScores.forEach(item => {
          item.students.forEach(s => {
            list.push({
              sbd: s.sbd,
              name: s.name,
              class: s.class,
              score: item.score,
              achievement: `${sub} (${item.score.toFixed(2)})`,
              category: `SUBJ_${sub}`,
              catLabel: sub.toUpperCase(),
              colorClass: subjectColors[subIdx % subjectColors.length]
            });
          });
        });
      }
    });

    return list;
  }, [students]);

  const handleSaveRewards = async () => {
    setSavingRewards(true);
    try {
      await setDoc(doc(db, "config", "rewards"), rewardsState);
      alert("Đã lưu thông tin khen thưởng thành công!");
    } catch (error) {
      console.error(error);
      alert("Lỗi khi lưu dữ liệu.");
    } finally {
      setSavingRewards(false);
    }
  };

  const exportRewardsExcel = () => {
    const selectedEntries = calculateRewardsList.map((entry, idx) => ({
      ...entry,
      config: rewardsState[`${entry.sbd}_${entry.category}`] || { amount: 0, selected: false }
    })).filter(e => e.config.selected);

    if (selectedEntries.length === 0) {
      alert("Vui lòng chọn ít nhất một thí sinh để xuất file!");
      return;
    }

    const totalAmount = selectedEntries.reduce((acc, curr) => acc + curr.config.amount, 0);

    const data = selectedEntries.map((e, idx) => ({
      "TT": idx + 1,
      "SBD": e.sbd,
      "Họ và tên": e.name,
      "Lớp": e.class,
      "TB THI": e.score.toFixed(2),
      "Thành tích": e.achievement,
      "Số tiền (VNĐ)": e.config.amount.toLocaleString('vi-VN')
    }));

    // Add total row
    data.push({
      "TT": "TỔNG CỘNG",
      "SBD": "",
      "Họ và tên": "",
      "Lớp": "",
      "TB THI": "",
      "Thành tích": "",
      "Số tiền (VNĐ)": totalAmount.toLocaleString('vi-VN')
    } as any);

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Khen Thuong");
    XLSX.writeFile(wb, `Danh_sach_khen_thuong_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.xlsx`);
  };

  const getFailReason = (s: Student) => {
    if (String(s.scores["TB THI"]).toUpperCase() === "X") return "VẮNG THI";
    
    let reasons: string[] = [];
    
    // Check for "liệt" subjects (> 0 and <= 1)
    const lietSubjects = SUBJECTS.filter(sub => {
      const val = parseFloat(String(s.scores[sub]).replace(',', '.'));
      return !isNaN(val) && val > 0 && val <= 1;
    });

    if (lietSubjects.length > 0) {
      reasons.push(`LIỆT MÔN ${lietSubjects.join(', ').toUpperCase()}`);
    }

    const xetTNStr = String(s.scores["XÉT TN"] || "");
    const xetTNNum = parseFloat(xetTNStr.replace(',', '.'));
    if (!isNaN(xetTNNum) && xetTNNum < 5) {
      reasons.push("KHÔNG ĐỦ ĐIỂM");
    }
    
    return reasons.join(' + ');
  };

  const handleImportGroupData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = "DUTHI";
        const worksheet = workbook.Sheets[sheetName];
        
        if (!worksheet) {
          alert("Không tìm thấy sheet 'DUTHI' trong file excel!");
          return;
        }

        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        if (jsonData.length < 1) {
          alert("File excel trống!");
          return;
        }

        // schools are in row 0, starting from col 1 (index 1)
        const headerRow = jsonData[0];
        const schools = headerRow.slice(1).map(s => String(s || "").trim()).filter(s => s !== "");
        
        if (schools.length === 0) {
          alert("Không tìm thấy tên trường ở cột thứ 2 trở đi trong dòng đầu tiên!");
          return;
        }

        const metrics: { label: string, values: any[] }[] = [];
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || row.length === 0 || row[0] === undefined || row[0] === null || String(row[0]).trim() === "") continue;
          
          const values = [];
          for (let col = 1; col <= schools.length; col++) {
            const val = row[col];
            values.push(val === undefined ? null : val);
          }

          metrics.push({
            label: String(row[0]),
            values
          });
        }

        // Read other sheets for detailed school data
        const details: Record<string, string> = {};
        workbook.SheetNames.forEach(name => {
          if (name === "DUTHI") return;
          const sheet = workbook.Sheets[name];
          const detailedData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
          
          // Sanitize detailed data and stringify because Firestore doesn't support nested arrays
          const sanitizedDetails = detailedData.map(row => 
            row.map(val => (val === undefined ? null : val))
          );
          
          details[name] = JSON.stringify(sanitizedDetails);
        });

        setTempGroupData({ schools, metrics, details });
        alert("Đã đọc dữ liệu thành công! Hãy nhấn CẬP NHẬT CỤM để lưu vào hệ thống.");
      } catch (err) {
        console.error(err);
        alert("Lỗi khi xử lý file excel!");
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleUpdateGroupData = async () => {
    if (!tempGroupData) {
      alert("Chưa có dữ liệu để cập nhật!");
      return;
    }

    setUpdatingGroup(true);
    try {
      const batch = writeBatch(db);
      
      // Save summary doc (exclude large details record)
      const summaryDoc = {
        schools: tempGroupData.schools,
        metrics: tempGroupData.metrics,
        updatedAt: new Date().toISOString()
      };
      batch.set(doc(db, "group_data", "latest"), summaryDoc);
      
      // Save each school's detail as a separate doc for performance
      if (tempGroupData.details) {
        Object.entries(tempGroupData.details).forEach(([schoolName, dataString]) => {
          batch.set(doc(db, "group_details", schoolName), { data: dataString });
        });
      }
      
      await batch.commit();
      
      setGroupData({ schools: tempGroupData.schools, metrics: tempGroupData.metrics });
      setTempGroupData(null);
      alert("Cập nhật dữ liệu cụm thành công!");
    } catch (err) {
      console.error(err);
      alert("Lỗi khi lưu dữ liệu cụm!");
    } finally {
      setUpdatingGroup(false);
    }
  };

  const handleImportComparisonData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

        if (jsonData.length < 2) {
          alert("File excel không đủ dữ liệu!");
          return;
        }

        // Search for relevant columns in header row (row 0 or find it)
        let headerRowIdx = 0;
        // Find row that contains "Môn"
        for(let i=0; i<Math.min(jsonData.length, 10); i++) {
          if (jsonData[i].some(cell => String(cell || "").toUpperCase().includes("MÔN"))) {
            headerRowIdx = i;
            break;
          }
        }
        
        const headerRow = jsonData[headerRowIdx];
        const subHeaderRow = jsonData[headerRowIdx + 1] || [];
        const metrics = [];

        // Dynamic column detection
        let colSub = -1, colRate1 = -1, colRate2 = -1, colScore1 = -1, colScore2 = -1;

        // Try to find subject column
        colSub = headerRow.findIndex(c => String(c || "").toUpperCase().includes("MÔN"));

        // If subHeaderRow exists, it might contain "Lần 1", "Lần 2"
        // If not, we check main header row for indices
        headerRow.forEach((cell, idx) => {
          const c = String(cell || "").toUpperCase();
          const nextC = String(headerRow[idx + 1] || "").toUpperCase();
          
          if (c.includes("TỈ LỆ") || c.includes("TRUNG BÌNH TRỞ LÊN")) {
            // Usually pairs follow
            colRate1 = idx;
            colRate2 = idx + 1;
          }
          if (c.includes("ĐIỂM THI") || c.includes("ĐIỂM TB")) {
            colScore1 = idx;
            colScore2 = idx + 1;
          }
        });

        // Fallback to absolute indexing if keywords fail
        if (colRate1 === -1) { colRate1 = 1; colRate2 = 2; }
        if (colScore1 === -1) { colScore1 = 3; colScore2 = 4; }
        if (colSub === -1) colSub = 0;
        
        // Start after labels (headerRow + subHeader if it exists)
        const startIdx = subHeaderRow.some(c => String(c || "").toUpperCase().includes("LẦN")) ? headerRowIdx + 2 : headerRowIdx + 1;

        for (let i = startIdx; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || row.length < 2 || !row[colSub]) continue;

          const subject = String(row[colSub]).trim();
          if (subject === "TỔNG" || subject === "CỘNG" || subject.includes("TRUNG BÌNH CỘNG")) continue;

          metrics.push({
            subject,
            rate1: parseFloat(String(row[colRate1] || 0).replace(',', '.')) || 0,
            rate2: parseFloat(String(row[colRate2] || 0).replace(',', '.')) || 0,
            score1: parseFloat(String(row[colScore1] || 0).replace(',', '.')) || 0,
            score2: parseFloat(String(row[colScore2] || 0).replace(',', '.')) || 0
          });
        }

        setTempComparisonData(metrics);
        alert("Đã đọc dữ liệu thành công! Hãy nhấn CẬP NHẬT để lưu vào hệ thống.");
      } catch (err) {
        console.error(err);
        alert("Lỗi khi xử lý file excel!");
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleUpdateComparisonData = async () => {
    if (!tempComparisonData) return;
    setUpdatingComparison(true);
    try {
      await setDoc(doc(db, "comparison_data", "latest"), {
        data: tempComparisonData,
        updatedAt: new Date().toISOString()
      });
      setComparisonData(tempComparisonData);
      setTempComparisonData(null);
      alert("Cập nhật dữ liệu so sánh lần trước thành công!");
    } catch (err) {
      console.error(err);
      alert("Lỗi khi lưu dữ liệu so sánh!");
    } finally {
      setUpdatingComparison(false);
    }
  };

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-bento-bg flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-xl w-full bg-bento-card rounded-2xl shadow-2xl p-10 border border-bento-border text-center"
        >
          <img 
            src="https://thptpvd.com/img/logopvd.png" 
            alt="THPT PVD Logo" 
            className="w-24 h-24 mx-auto mb-6 object-contain"
            referrerPolicy="no-referrer"
          />
          <h1 className="text-2xl font-black text-bento-accent tracking-tighter uppercase mb-2">📊 THỐNG KÊ THI THỬ TỐT NGHIỆP THPT</h1>
          <p className="text-bento-subtext mb-8 font-bold text-sm tracking-wide uppercase">Nhập mã xác nhận truy cập</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <input 
              type="password"
              value={authCode}
              onChange={(e) => setAuthCode(e.target.value)}
              placeholder="••••••"
              className="w-full px-6 py-4 rounded-xl bg-bento-bg border border-bento-border focus:ring-2 focus:ring-bento-accent/50 focus:border-bento-accent outline-none transition-all text-center text-xl tracking-widest text-bento-text placeholder:text-bento-border"
            />
            <button 
              type="submit"
              className="w-full bg-bento-accent hover:bg-bento-accent/90 text-white font-black py-4 rounded-xl transition-all shadow-lg shadow-bento-accent/10 uppercase tracking-widest text-xs"
            >
              Xác nhận hệ thống
            </button>
          </form>

          <div className="mt-10 pt-6 border-t border-bento-border/50">
            <p className="text-[10px] text-bento-subtext uppercase tracking-widest font-black">THIẾT KẾ BỞI: <span className="text-blue-600">TRẦN TUẤN ANH</span></p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bento-bg flex flex-col md:flex-row font-sans text-bento-text">
      {/* Sidebar */}
      <aside className="w-full md:w-[260px] bg-bento-card border-r border-bento-border flex flex-col h-screen sticky top-0">
        <div className="p-8">
          <div className="text-[12px] font-black text-bento-accent tracking-tighter uppercase leading-tight">
            📊 THỐNG KÊ THI THỬ<br />
            TỐT NGHIỆP THPT
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          {role === 'admin' ? (
            <NavItem 
              active={activeTab === "data"} 
              onClick={() => setActiveTab("data")}
              icon={<Settings size={18} />}
              label="DỮ LIỆU"
            />
          ) : (
            <div className="flex items-center gap-4 w-full px-5 py-3.5 rounded-xl text-bento-subtext opacity-30 font-bold text-[11px] uppercase tracking-widest cursor-not-allowed">
              <Settings size={18} />
              <span>DỮ LIỆU</span>
            </div>
          )}

          {role === 'admin' ? (
            <NavItem 
              active={activeTab === "rewards"} 
              onClick={() => setActiveTab("rewards")}
              icon={<Trophy size={18} />}
              label="KHEN THƯỞNG"
            />
          ) : (
            <div className="flex items-center gap-4 w-full px-5 py-3.5 rounded-xl text-bento-subtext opacity-30 font-bold text-[11px] uppercase tracking-widest cursor-not-allowed">
              <Trophy size={18} />
              <span>KHEN THƯỞNG</span>
            </div>
          )}

          <NavItem 
            active={activeTab === "school"} 
            onClick={() => setActiveTab("school")}
            icon={<BarChart3 size={18} />}
            label="THỐNG KÊ TRƯỜNG"
          />
          
          <NavItem 
            active={activeTab === "subject"} 
            onClick={() => setActiveTab("subject")}
            icon={<BookOpen size={18} />}
            label="THỐNG KÊ MÔN"
          />

          <NavItem 
            active={activeTab === "class"} 
            onClick={() => setActiveTab("class")}
            icon={<Users size={18} />}
            label="THỐNG KÊ LỚP"
          />

          <NavItem 
            active={activeTab === "history"} 
            onClick={() => setActiveTab("history")}
            icon={<BarChart3 size={18} />}
            label="SO SÁNH LẦN TRƯỚC"
          />

          <NavItem 
            active={activeTab === "compare"} 
            onClick={() => setActiveTab("compare")}
            icon={<ChevronRight size={18} />}
            label="SO SÁNH CỤM"
          />
        </nav>

        <div className="p-8 mt-auto flex flex-col gap-4">
          <div className="text-[10px] text-bento-subtext uppercase tracking-widest font-black">
            THIẾT KẾ BỞI:<br />
            <span className="text-blue-600">TRẦN TUẤN ANH</span>
          </div>
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-5 py-3.5 text-bento-subtext hover:bg-bento-danger/10 hover:text-bento-danger rounded-xl transition-all font-bold text-[10px] uppercase tracking-widest"
          >
            <LogOut size={16} />
            <span>Đăng xuất</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-6 grid grid-cols-1 md:grid-cols-4 auto-rows-min gap-4 overflow-y-auto">
        {/* Header Bar */}
        <header className="md:col-span-4 flex items-center justify-between mb-4">
          <h2 className="text-xl font-black text-bento-text tracking-tighter uppercase">
            {activeTab === "data" && "Trung Tâm Quản Lý Dữ Liệu"}
            {activeTab === "rewards" && "Quản Lý Khen Thưởng"}
            {activeTab === "school" && "Thống Kê Toàn Trường"}
            {activeTab === "subject" && "Thống Kê Theo Môn Học"}
            {activeTab === "class" && "Thống Kê Theo Lớp"}
            {activeTab === "history" && "So Sánh Kết Quả Lần 1 & 2"}
            {activeTab === "compare" && "So Sánh Cụm Chuyên Môn"}
          </h2>

          <div className="flex gap-3 items-center">
            {config.hasData && (
              <div className="bg-bento-success/10 text-bento-success px-4 py-1.5 rounded-full text-[10px] font-black border border-bento-success/30 uppercase tracking-widest">
                ĐÃ CÓ ĐIỂM
              </div>
            )}
            <div className="bg-bento-accent/10 text-bento-accent px-4 py-1.5 rounded-full text-[10px] font-black border border-bento-accent/30 uppercase tracking-widest">
              ● {role === 'admin' ? "Quyền Quản Trị Hệ Thống" : "Quyền Người Xem"}
            </div>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {activeTab === "data" && role === 'admin' && (
            <motion.div 
              key="data"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="col-span-1 md:col-span-4 bg-bento-card border border-bento-border rounded-2xl p-8 flex flex-col gap-6"
            >
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <div className="text-[10px] font-black text-bento-subtext uppercase tracking-widest mb-2">Quản Lý Nhập Dữ Liệu</div>
                  <h3 className="text-xl font-black text-bento-text uppercase tracking-tight">Cấu hình nguồn dữ liệu</h3>
                </div>
                <div className="flex gap-3">
                  <label className="cursor-pointer bg-bento-bg hover:bg-bento-border/20 text-bento-text font-black px-5 py-2.5 rounded-xl border border-bento-border transition-all flex items-center gap-3 text-[10px] uppercase tracking-widest">
                    <Upload size={16} />
                    📂 IMPORT FILE
                    <input type="file" className="hidden" accept=".xlsx, .xls" onChange={handleFileUpload} />
                  </label>

                  <button 
                    onClick={handleUpdateData}
                    disabled={tempData.length === 0 || importing}
                    className={cn(
                      "font-black px-5 py-2.5 rounded-xl transition-all flex items-center gap-3 text-[10px] uppercase tracking-widest",
                      tempData.length > 0 ? "bg-bento-accent text-white shadow-lg shadow-bento-accent/20" : "bg-bento-bg text-bento-subtext border border-bento-border/50 cursor-not-allowed"
                    )}
                  >
                    <CheckCircle2 size={16} />
                    {importing ? "ĐANG ĐỒNG BỘ..." : "🔄 CẬP NHẬT"}
                  </button>
                </div>
              </div>

              <div className="bg-bento-table-bg rounded-xl border border-bento-border overflow-hidden flex-1 scrollbar-hide">
                <div className="overflow-auto max-h-[500px] scrollbar-thin scrollbar-thumb-bento-border">
                      <table className="w-full text-left text-[12px] border-collapse min-w-[1200px]">
                        <thead className="bg-bento-table-header sticky top-0 z-10 border-b border-bento-border shadow-sm">
                          <tr>
                            {DATA_COLUMNS.map(col => (
                              <th key={col} className="px-5 py-4 font-bold text-bento-text uppercase tracking-tight text-[10px] whitespace-nowrap bg-bento-table-header">{col}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-bento-border">
                          {(tempData.length > 0 ? tempData : students).map((s, i) => (
                            <tr key={i} className="hover:bg-bento-accent/[0.02] transition-colors group">
                              <td className="px-5 py-3 text-bento-text font-mono tabular-nums font-bold">{i + 1}</td>
                              <td className="px-5 py-3 text-bento-accent font-mono font-bold tabular-nums tracking-tighter">{s.sbd}</td>
                              <td className="px-5 py-3 text-bento-text font-bold whitespace-nowrap">{s.name}</td>
                              <td className="px-5 py-3 text-bento-text font-bold whitespace-nowrap">{s.class}</td>
                              {SUBJECTS.map(sub => (
                                <td key={sub} className={cn(
                                  "px-5 py-3 font-mono tabular-nums text-center font-bold",
                                  s.scores[sub] < 1 ? "text-bento-danger opacity-100" : "text-bento-text"
                                )}>
                                  {formatScore(s.scores[sub])}
                                </td>
                              ))}
                              <td className="px-5 py-3 font-mono font-bold text-bento-accent text-center bg-bento-accent/5">{formatScore(s.scores["TB THI"])}</td>
                              <td className="px-5 py-3 text-bento-text font-mono tabular-nums text-center font-bold">{formatScore(s.scores["ĐTB 10"])}</td>
                              <td className="px-5 py-3 text-bento-text font-mono tabular-nums text-center font-bold">{formatScore(s.scores["ĐTB 11"])}</td>
                              <td className="px-5 py-3 text-bento-text font-mono tabular-nums text-center font-bold">{formatScore(s.scores["ĐTB 12"])}</td>
                              <td className="px-5 py-3 text-bento-text font-mono tabular-nums text-center font-bold">{formatScore(s.scores["ĐTB HT"])}</td>
                              <td className={cn(
                                "px-5 py-3 font-bold text-[10px] uppercase text-center whitespace-nowrap",
                                String(s.scores["XÉT TN"] || "").includes("Đỗ") ? "text-bento-success" : "text-bento-danger"
                              )}>
                                {s.scores["XÉT TN"]}
                              </td>
                              <td className={cn(
                                "px-5 py-3 font-bold text-[10px] uppercase text-center whitespace-nowrap",
                                String(s.scores["KQ"] || "").includes("G") ? "text-bento-success" : "text-bento-accent"
                              )}>
                                {s.scores["KQ"]}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "rewards" && (
            <motion.div 
              key="rewards"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="col-span-1 md:col-span-4 space-y-6"
            >
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-bento-card p-6 rounded-2xl border border-bento-border shadow-sm">
                <div>
                  <h3 className="text-2xl font-black text-bento-text uppercase tracking-tight">DANH SÁCH KHEN THƯỞNG</h3>
                  <p className="text-xs text-bento-subtext font-bold uppercase tracking-widest mt-1">Lập danh sách khen thưởng cho Thủ khoa và Top bộ môn</p>
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={exportRewardsExcel}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-emerald-600/10"
                  >
                    <Download size={14} /> Xuất Excel
                  </button>
                  <button 
                    onClick={handleSaveRewards}
                    disabled={savingRewards}
                    className={cn(
                      "flex items-center gap-2 bg-bento-accent hover:bg-bento-accent/90 text-white px-8 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-bento-accent/10",
                      savingRewards && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {savingRewards ? "Đang lưu..." : "Lưu dữ liệu"}
                  </button>
                </div>
              </div>

              <div className="bg-bento-card border border-bento-border rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[13px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-bento-border text-[11px]">
                        <th className="px-6 py-4 font-black text-bento-subtext text-center w-16 border-r border-bento-border">TT</th>
                        <th className="px-6 py-4 font-black text-bento-subtext border-r border-bento-border">SBD</th>
                        <th className="px-6 py-4 font-black text-bento-subtext border-r border-bento-border">HỌ VÀ TÊN</th>
                        <th className="px-6 py-4 font-black text-bento-subtext border-r border-bento-border text-center">LỚP</th>
                        <th className="px-6 py-4 font-black text-bento-subtext border-r border-bento-border text-center">ĐIỂM THI</th>
                        <th className="px-6 py-4 font-black text-bento-subtext border-r border-bento-border">THÀNH TÍCH</th>
                        <th className="px-6 py-4 font-black text-bento-subtext border-r border-bento-border text-right min-w-[200px]">
                          SỐ TIỀN (VNĐ)
                          <div className="text-[9px] text-red-600 mt-1">
                            TỔNG: {
                              calculateRewardsList.filter(e => rewardsState[`${e.sbd}_${e.category}`]?.selected).reduce((acc, curr) => acc + (rewardsState[`${curr.sbd}_${curr.category}`]?.amount || 0), 0).toLocaleString('vi-VN')
                            }
                          </div>
                        </th>
                        <th className="px-6 py-4 font-black text-bento-subtext text-center">CHỌN</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-bento-border">
                      {calculateRewardsList.map((entry, idx) => {
                        const key = `${entry.sbd}_${entry.category}`;
                        const state = rewardsState[key] || { amount: 0, selected: false };
                        
                        return (
                          <tr key={key} className={cn("transition-colors", entry.colorClass)}>
                            <td className="px-6 py-3 font-mono text-center text-bento-subtext border-r border-bento-border bg-white">{idx + 1}</td>
                            <td className="px-6 py-3 font-mono font-bold border-r border-bento-border">{entry.sbd}</td>
                            <td className="px-6 py-3 font-black whitespace-nowrap border-r border-bento-border uppercase">{entry.name}</td>
                            <td className="px-6 py-3 font-bold text-center border-r border-bento-border">{entry.class}</td>
                            <td className="px-6 py-3 font-mono font-black text-center border-r border-bento-border">{entry.score.toFixed(2)}</td>
                            <td className="px-6 py-3 font-black text-[11px] border-r border-bento-border uppercase tracking-tight">
                              {entry.achievement.includes('(') ? (
                                <>
                                  {entry.achievement.split('(')[0]} 
                                  <span className="text-red-600">({entry.achievement.split('(')[1]}</span>
                                </>
                              ) : entry.achievement}
                            </td>
                            <td className="px-4 py-2 border-r border-bento-border">
                              <input 
                                type="text"
                                value={state.amount === 0 ? "" : state.amount.toLocaleString('vi-VN')}
                                onChange={(e) => {
                                  const val = e.target.value.replace(/\D/g, '');
                                  setRewardsState(prev => ({
                                    ...prev,
                                    [key]: { ...state, amount: parseInt(val) || 0 }
                                  }));
                                }}
                                placeholder="0"
                                className="w-full bg-white border border-bento-border px-4 py-2 rounded-lg font-mono font-bold text-right outline-none focus:ring-2 focus:ring-bento-accent/30"
                              />
                            </td>
                            <td className="px-6 py-2 text-center">
                              <input 
                                type="checkbox"
                                checked={state.selected}
                                onChange={(e) => {
                                  setRewardsState(prev => ({
                                    ...prev,
                                    [key]: { ...state, selected: e.target.checked }
                                  }));
                                }}
                                className="w-5 h-5 accent-bento-accent transition-all cursor-pointer"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "school" && stats && (
            <motion.div 
              key="school"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="col-span-1 md:col-span-4 space-y-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <div className="bg-bento-card border border-bento-border p-5 rounded-2xl">
                  <p className="text-[10px] font-black text-bento-subtext uppercase tracking-widest mb-1">Đăng ký dự thi</p>
                  <p className="text-3xl font-black text-bento-text">{stats.totalStudents}</p>
                </div>
                <div className="bg-bento-card border border-bento-border p-5 rounded-2xl">
                  <p className="text-[10px] font-black text-green-600 uppercase tracking-widest mb-1">Tham gia dự thi</p>
                  <p className="text-3xl font-black text-green-600">{stats.participatedCount}</p>
                </div>
                <div className="bg-bento-card border border-bento-border p-5 rounded-2xl">
                  <p className="text-[10px] font-black text-red-600 uppercase tracking-widest mb-1">Vắng thi (X)</p>
                  <p className="text-3xl font-black text-red-600">{stats.absentCount}</p>
                </div>
                <div className="bg-bento-card border border-bento-border p-5 rounded-2xl">
                  <p className="text-[10px] font-black text-bento-accent uppercase tracking-widest mb-1">Đậu tốt nghiệp (Đ)</p>
                  <div className="flex items-baseline gap-2">
                    <p className="text-3xl font-black text-bento-accent">{stats.passedList.length}</p>
                    <p className="text-sm font-black text-bento-subtext">({stats.passRate.toFixed(1)}%)</p>
                  </div>
                </div>
                <div className="bg-bento-card border border-bento-border p-5 rounded-2xl">
                  <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest mb-1">Hỏng tốt nghiệp (H)</p>
                  <div className="flex items-baseline gap-2">
                    <p className="text-3xl font-black text-orange-600">{stats.failedList.length}</p>
                    <p className="text-sm font-black text-bento-subtext">({stats.failRate.toFixed(1)}%)</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Absent List */}
                <div className="lg:col-span-2 bg-bento-card border border-bento-border rounded-2xl overflow-hidden shadow-sm">
                  <div className="bg-red-50 px-6 py-4 border-b border-bento-border">
                    <h3 className="text-[11px] font-black text-red-700 uppercase tracking-widest flex items-center gap-2">
                      <AlertCircle size={14} /> Danh sách vắng thi
                    </h3>
                  </div>
                  <div className="overflow-auto max-h-[400px]">
                    <table className="w-full text-left text-[13px]">
                      <thead className="bg-bento-table-header sticky top-0 border-b border-bento-border">
                        <tr>
                          <th className="px-4 py-4 font-black text-bento-text w-20">SBD</th>
                          <th className="px-4 py-4 font-black text-bento-text">Họ và tên</th>
                          <th className="px-4 py-4 font-black text-bento-text w-20">Lớp</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-bento-border">
                        {stats.absentList.length > 0 ? stats.absentList.map(s => (
                          <tr key={s.id} className="hover:bg-red-50/30">
                            <td className="px-4 py-3 font-mono text-red-600 font-bold">{s.sbd}</td>
                            <td className="px-4 py-3 font-semibold text-bento-text whitespace-nowrap">{s.name}</td>
                            <td className="px-4 py-3 text-bento-subtext font-medium">{s.class}</td>
                          </tr>
                        )) : (
                          <tr><td colSpan={3} className="px-5 py-8 text-center text-bento-subtext font-medium">Không có thí sinh vắng thi</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Failed List */}
                <div className="lg:col-span-3 bg-bento-card border border-bento-border rounded-2xl overflow-hidden shadow-sm">
                  <div className="bg-orange-50 px-6 py-4 border-b border-bento-border">
                    <h3 className="text-[11px] font-black text-orange-700 uppercase tracking-widest flex items-center gap-2">
                      <Trash2 size={14} /> Danh sách hỏng tốt nghiệp
                    </h3>
                  </div>
                  <div className="overflow-auto max-h-[500px]">
                    <table className="w-full text-left text-[13px]">
                      <thead className="bg-bento-table-header sticky top-0 border-b border-bento-border">
                        <tr>
                          <th className="px-5 py-4 font-black text-bento-text w-24">SBD</th>
                          <th className="px-5 py-4 font-black text-bento-text">Họ và tên</th>
                          <th className="px-5 py-4 font-black text-bento-text w-24">Lớp</th>
                          <th className="px-5 py-4 font-black text-bento-text text-center w-24">XÉT TN</th>
                          <th className="px-5 py-4 font-black text-bento-text">LÝ DO</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-bento-border">
                        {stats.failedList.length > 0 ? stats.failedList.map(s => (
                          <tr key={s.id} className="hover:bg-orange-50/30">
                            <td className="px-5 py-3 font-mono text-orange-600 font-bold">{s.sbd}</td>
                            <td className="px-5 py-3 font-semibold text-bento-text whitespace-nowrap">{s.name}</td>
                            <td className="px-5 py-3 text-bento-subtext font-medium">{s.class}</td>
                            <td className="px-5 py-3 text-center text-red-600 font-black">{s.scores["XÉT TN"]}</td>
                            <td className="px-5 py-3 text-orange-700 font-black text-[11px] uppercase">{getFailReason(s)}</td>
                          </tr>
                        )) : (
                          <tr><td colSpan={5} className="px-5 py-8 text-center text-bento-subtext font-medium">Không có thí sinh hỏng tốt nghiệp</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Detailed Subject Stats */}
                <div className="col-span-1 lg:col-span-5 bg-bento-card border border-bento-border rounded-2xl overflow-hidden shadow-sm mt-4">
                  <div className="bg-bento-table-header px-6 py-4 border-b border-bento-border">
                    <h3 className="text-[11px] font-black text-bento-text uppercase tracking-widest flex items-center gap-2">
                      📊 Thống kê chi tiết theo môn học
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[12px]">
                      <thead className="bg-bento-table-header border-b border-bento-border">
                        <tr className="divide-x divide-bento-border">
                          <th className="px-6 py-5 font-black text-bento-text uppercase text-sm">Môn học</th>
                          <th className="px-6 py-5 font-black text-bento-text uppercase text-center text-sm">Dự thi</th>
                          <th className="px-6 py-5 font-black text-red-700 uppercase text-center bg-red-100/50 text-sm">Điểm liệt (≤1)</th>
                          <th className="px-6 py-5 font-black text-orange-700 uppercase text-center bg-orange-100/50 text-sm">Điểm 0-2</th>
                          <th className="px-6 py-5 font-black text-bento-text uppercase text-center text-sm">Dưới TB (&lt;5)</th>
                          <th className="px-6 py-5 font-black text-bento-success uppercase text-center text-sm">Trên TB (&ge;5)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-bento-border">
                        {stats.detailedSubjectStats.map(sub => (
                          <tr key={sub.name} className="hover:bg-bento-accent/[0.02] divide-x divide-bento-border">
                            <td className="px-6 py-4 font-black text-bento-text uppercase text-sm">{sub.name}</td>
                            <td className="px-6 py-4 font-mono text-center font-black text-lg text-bento-text">{sub.participated}</td>
                            <td className="px-6 py-4 text-center bg-red-50/50">
                              <span className="font-mono font-black text-red-600 text-xl">{sub.liet}</span>
                              <br />
                              <span className="text-[14px] text-red-700 font-black">({sub.lietRate.toFixed(1)}%)</span>
                            </td>
                            <td className="px-6 py-4 text-center bg-orange-50/50">
                              <span className="font-mono font-black text-orange-600 text-xl">{sub.zeroToTwo}</span>
                              <br />
                              <span className="text-[14px] text-orange-700 font-black">({sub.zeroToTwoRate.toFixed(1)}%)</span>
                            </td>
                            <td className="px-6 py-4 text-center bg-bento-bg/30">
                              <span className="font-mono font-black text-bento-text text-xl">{sub.belowAvg}</span>
                              <br />
                              <span className="text-[14px] text-bento-subtext font-black">({sub.belowAvgRate.toFixed(1)}%)</span>
                            </td>
                            <td className="px-6 py-4 text-center bg-green-50/20">
                              <span className="font-mono font-black text-bento-success text-xl">{sub.aboveAvg}</span>
                              <br />
                              <span className="text-[14px] text-bento-success font-black">({sub.aboveAvgRate.toFixed(1)}%)</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "subject" && (
            <motion.div 
              key="subject"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="col-span-1 md:col-span-4 space-y-6"
            >
              {/* Subject Selector */}
              <div className="bg-bento-card border border-bento-border p-6 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="text-sm font-black text-bento-subtext uppercase tracking-widest">Chọn môn học để xem phân tích chi tiết:</div>
                <select 
                  value={selectedSubject}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                  className="bg-bento-bg border border-bento-border px-8 py-3 rounded-xl font-bold text-bento-text outline-none focus:ring-2 focus:ring-bento-accent transition-all min-w-[250px] appearance-none"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1.2em' }}
                >
                  <option value="">-- CHỌN MÔN HỌC --</option>
                  {SUBJECTS.map(sub => <option key={sub} value={sub}>{sub.toUpperCase()}</option>)}
                </select>
              </div>

              {!selectedSubject ? (
                <div className="flex flex-col items-center justify-center py-40 bg-bento-card/50 border border-dashed border-bento-border rounded-3xl opacity-60">
                  <BookOpen size={48} className="mb-4 text-bento-subtext" />
                  <h2 className="text-xl font-black text-bento-text uppercase tracking-widest">HÃY CHỌN MÔN HỌC ĐỂ XEM THÔNG TIN CHI TIẾT</h2>
                </div>
              ) : calculateSubjectDetailedStats ? (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                  {/* Title */}
                  <div className="text-center py-8">
                    <h2 className="text-4xl font-black text-bento-text uppercase tracking-tighter">THỐNG KÊ ĐIỂM THI MÔN {selectedSubject.toUpperCase()}</h2>
                    <div className="w-24 h-1.5 bg-bento-accent mx-auto mt-4 rounded-full" />
                  </div>

                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    <SummaryCard label="Dự thi" value={calculateSubjectDetailedStats.total} />
                    <SummaryCard label="Điểm liệt (≤1)" value={calculateSubjectDetailedStats.metrics.liet} rate={calculateSubjectDetailedStats.metrics.lietRate} color="red" />
                    <SummaryCard label="Điểm 0-2" value={calculateSubjectDetailedStats.metrics.zeroToTwo} rate={calculateSubjectDetailedStats.metrics.zeroToTwoRate} color="orange" />
                    <SummaryCard label="Dưới TB (<5)" value={calculateSubjectDetailedStats.metrics.belowAvg} rate={calculateSubjectDetailedStats.metrics.belowAvgRate} color="slate" />
                    <SummaryCard label="Trên TB (≥5)" value={calculateSubjectDetailedStats.metrics.aboveAvg} rate={calculateSubjectDetailedStats.metrics.aboveAvgRate} color="emerald" />
                  </div>

                  {/* Top Students Table */}
                  <div className="bg-bento-card border border-bento-border rounded-2xl overflow-hidden shadow-sm">
                    <div className="bg-emerald-50 px-6 py-4 border-b border-emerald-100 flex items-center gap-2">
                      <Trophy size={16} className="text-emerald-600" />
                      <h3 className="text-[11px] font-black text-emerald-900 uppercase tracking-widest">TOP THÍ SINH CÓ ĐIỂM THI CAO NHẤT MÔN {selectedSubject.toUpperCase()}</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-[13px]">
                        <thead>
                          <tr className="bg-emerald-50/30 border-b border-bento-border text-[11px]">
                            <th className="px-6 py-3 font-black text-bento-subtext text-center w-16 border-r border-bento-border">TT</th>
                            <th className="px-6 py-3 font-black text-bento-subtext border-r border-bento-border">SBD</th>
                            <th className="px-6 py-3 font-black text-bento-subtext border-r border-bento-border">HỌ VÀ TÊN</th>
                            <th className="px-6 py-3 font-black text-bento-subtext border-r border-bento-border">LỚP</th>
                            <th className="px-6 py-3 font-black text-bento-subtext text-center">ĐIỂM THI</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-bento-border">
                          {calculateSubjectDetailedStats.topStudents.map((student, idx) => (
                            <tr key={student.sbd} className="hover:bg-emerald-50/20 transition-colors">
                              <td className="px-6 py-2.5 font-mono text-center text-bento-subtext border-r border-bento-border">{idx + 1}</td>
                              <td className="px-6 py-2.5 font-mono font-bold text-bento-text border-r border-bento-border">{student.sbd}</td>
                              <td className="px-6 py-2.5 font-bold text-bento-text border-r border-bento-border whitespace-nowrap">{student.name}</td>
                              <td className="px-6 py-2.5 font-bold text-bento-text border-r border-bento-border">{student.class}</td>
                              <td className="px-6 py-2.5 font-mono font-black text-center text-lg text-emerald-600">{student.score.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Range distribution Table */}
                  <div className="bg-bento-card border border-bento-border rounded-2xl overflow-hidden shadow-sm">
                    <div className="bg-bento-table-header px-6 py-4 border-b border-bento-border">
                      <h3 className="text-[11px] font-black text-bento-text uppercase tracking-widest">Phân bố điểm theo các khoảng mốc</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-[13px]">
                        <thead>
                          <tr className="bg-bento-bg/50 border-b border-bento-border text-[11px]">
                            <th rowSpan={2} className="px-6 py-4 font-black text-bento-text text-left border-r border-bento-border uppercase sticky left-0 bg-bento-card">Lớp</th>
                            <th rowSpan={2} className="px-6 py-4 font-black text-bento-text text-center border-r border-bento-border uppercase">Dự thi</th>
                            {calculateSubjectDetailedStats.ranges.map(r => (
                              <th key={r.label} colSpan={2} className="px-6 py-4 font-black text-bento-text text-center border-r border-bento-border last:border-r-0 uppercase">{r.label}</th>
                            ))}
                            <th colSpan={2} className="px-6 py-4 font-black text-emerald-700 text-center border-l-2 border-emerald-200 uppercase bg-emerald-50/50">TB TRỞ LÊN</th>
                          </tr>
                          <tr className="bg-bento-bg/30 border-b border-bento-border">
                            {calculateSubjectDetailedStats.ranges.map((_, i) => (
                              <React.Fragment key={i}>
                                <th className="px-4 py-2 text-[10px] font-black text-bento-subtext text-center border-r border-bento-border">SL</th>
                                <th className="px-4 py-2 text-[10px] font-black text-bento-subtext text-center border-r border-bento-border last:border-r-0">TL (%)</th>
                              </React.Fragment>
                            ))}
                            <th className="px-4 py-2 text-[10px] font-black text-emerald-700 text-center border-r border-bento-border border-l-2 border-emerald-200">SL</th>
                            <th className="px-4 py-2 text-[10px] font-black text-emerald-700 text-center">TL (%)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-bento-border">
                          {calculateSubjectDetailedStats.classData.map((cls, idx) => (
                            <tr key={idx} className="hover:bg-bento-accent/[0.02]">
                              <td className="px-6 py-3 font-black text-bento-text border-r border-bento-border whitespace-nowrap">{cls.className}</td>
                              <td className="px-6 py-3 font-mono font-bold text-center border-r border-bento-border">{cls.total}</td>
                              {cls.stats.map((s, si) => (
                                <React.Fragment key={si}>
                                  <td className="px-4 py-3 font-mono text-center border-r border-bento-border">{s.count}</td>
                                  <td className="px-4 py-3 font-mono text-center font-bold text-bento-accent border-r border-bento-border last:border-r-0">{s.rate > 0 ? s.rate.toFixed(1) : "-"}</td>
                                </React.Fragment>
                              ))}
                              <td className="px-4 py-3 font-mono text-center border-r border-bento-border border-l-2 border-emerald-200 bg-emerald-50/20 font-bold text-emerald-700">{cls.aboveFive.count}</td>
                              <td className="px-4 py-3 font-mono text-center font-black text-emerald-600 bg-emerald-50/20">{cls.aboveFive.rate > 0 ? cls.aboveFive.rate.toFixed(1) : "-"}</td>
                            </tr>
                          ))}
                          {/* Total Row */}
                          <tr className="bg-bento-accent/[0.05] font-bold">
                            <td className="px-6 py-4 font-black text-bento-accent border-r border-bento-border uppercase">TỔNG</td>
                            <td className="px-6 py-4 font-mono font-black text-center border-r border-bento-border text-lg">{calculateSubjectDetailedStats.total}</td>
                            {calculateSubjectDetailedStats.totalRangeStats.map((s, si) => (
                              <React.Fragment key={si}>
                                <td className="px-4 py-4 font-mono text-center border-r border-bento-border text-lg">{s.count}</td>
                                <td className="px-4 py-4 font-mono text-center font-black text-bento-accent border-r border-bento-border last:border-r-0 text-lg">{s.rate.toFixed(1)}%</td>
                              </React.Fragment>
                            ))}
                            <td className="px-4 py-4 font-mono text-center border-r border-bento-border border-l-2 border-emerald-200 bg-emerald-50/50 text-emerald-700 text-lg font-black">{calculateSubjectDetailedStats.totalAboveFive.count}</td>
                            <td className="px-4 py-4 font-mono text-center font-black text-emerald-600 bg-emerald-50/50 text-lg">{calculateSubjectDetailedStats.totalAboveFive.rate.toFixed(1)}%</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Chart and Stats Table */}
                  <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    <div className="lg:col-span-3 bg-bento-card border border-bento-border rounded-2xl p-6">
                      <div className="text-[10px] font-black text-bento-subtext uppercase tracking-widest mb-6">Biểu đồ phổ điểm mô phỏng (0 - 10, bước 0.25)</div>
                      <div className="h-[400px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={calculateSubjectDetailedStats.histogram}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-bento-border)" />
                            <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--color-bento-subtext)', fontWeight: 'bold' }} />
                            <YAxis tick={{ fontSize: 10, fill: 'var(--color-bento-subtext)', fontWeight: 'bold' }} />
                            <Tooltip 
                              cursor={{ fill: 'rgba(37, 99, 235, 0.05)' }} 
                              contentStyle={{ backgroundColor: 'var(--color-bento-card)', borderRadius: '12px', border: '1px solid var(--color-bento-border)' }} 
                            />
                            <Bar dataKey="count" fill="var(--color-bento-accent)" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div className="bg-bento-card border border-bento-border rounded-2xl overflow-hidden self-start">
                      <div className="bg-slate-50 px-5 py-3 border-b border-bento-border">
                        <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Các chỉ số thống kê</p>
                      </div>
                      <table className="w-full text-[13px]">
                        <tbody className="divide-y divide-bento-border">
                          <StatRow label="Số thí sinh" value={calculateSubjectDetailedStats.total} />
                          <StatRow label="Điểm trung bình (ĐTB)" value={calculateSubjectDetailedStats.advanced.avg} highlight />
                          <StatRow label="Trung vị" value={calculateSubjectDetailedStats.advanced.median} />
                          <StatRow label="Độ lệch chuẩn" value={calculateSubjectDetailedStats.advanced.stdDev} />
                          <StatRow label="Số điểm 10" value={calculateSubjectDetailedStats.advanced.count10} color="emerald" />
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* AI Assessment */}
                  <div className="bg-bento-card border border-bento-border rounded-2xl p-8 overflow-hidden relative">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-xl font-black text-bento-text uppercase tracking-tight flex items-center gap-2">
                         ĐÁNH GIÁ CHUNG
                      </h3>
                    </div>
                    
                    <div className="text-bento-text leading-relaxed font-bold bg-slate-50/50 p-6 rounded-xl border border-bento-border/50 text-sm min-h-[100px] flex items-center">
                      {assessment || "Đang chờ dữ liệu phân tích..."}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-20 text-bento-subtext font-bold">Không có dữ liệu cho môn học này.</div>
              )}
            </motion.div>
          )}

          {activeTab === "class" && (
            <motion.div 
              key="class"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="col-span-1 md:col-span-4 space-y-6"
            >
              {/* Class Selector */}
              <div className="bg-bento-card border border-bento-border p-6 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="text-sm font-black text-bento-subtext uppercase tracking-widest">Chọn lớp để xem phân tích chi tiết:</div>
                <select 
                  value={selectedClass}
                  onChange={(e) => setSelectedClass(e.target.value)}
                  className="bg-bento-bg border border-bento-border px-8 py-3 rounded-xl font-bold text-bento-text outline-none focus:ring-2 focus:ring-bento-accent transition-all min-w-[250px] appearance-none"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1.2em' }}
                >
                  <option value="">-- CHỌN LỚP --</option>
                  {(stats?.classStats.map(c => c.name) || []).sort().map(cls => <option key={cls} value={cls}>{cls}</option>)}
                </select>
              </div>

              {!selectedClass ? (
                <div className="flex flex-col items-center justify-center py-40 bg-bento-card/50 border border-dashed border-bento-border rounded-3xl opacity-60">
                  <Users size={48} className="mb-4 text-bento-subtext" />
                  <h2 className="text-xl font-black text-bento-text uppercase tracking-widest">HÃY CHỌN LỚP ĐỂ XEM THÔNG TIN CHI TIẾT</h2>
                </div>
              ) : calculateClassDetailedStats ? (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                  {/* Title */}
                  <div className="text-center py-8">
                    <h2 className="text-4xl font-black text-bento-text uppercase tracking-tighter">THỐNG KÊ ĐIỂM THI LỚP {selectedClass.toUpperCase()}</h2>
                    <div className="w-24 h-1.5 bg-bento-accent mx-auto mt-4 rounded-full" />
                  </div>

                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    <SummaryCard label="Dự thi" value={calculateClassDetailedStats.metrics.duThi} />
                    <SummaryCard label="Điểm liệt (≤1)" value={calculateClassDetailedStats.metrics.liet} rate={calculateClassDetailedStats.metrics.lietRate} color="red" />
                    <SummaryCard label="Điểm 0-2" value={calculateClassDetailedStats.metrics.zeroToTwo} rate={calculateClassDetailedStats.metrics.zeroToTwoRate} color="orange" />
                    <SummaryCard label="Dưới TB (<5)" value={calculateClassDetailedStats.metrics.belowAvg} rate={calculateClassDetailedStats.metrics.belowAvgRate} color="slate" />
                    <SummaryCard label="Trên TB (≥5)" value={calculateClassDetailedStats.metrics.aboveAvg} rate={calculateClassDetailedStats.metrics.aboveAvgRate} color="emerald" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <SummaryCard label="XÉT TN" value={calculateClassDetailedStats.metrics.xetTN} color="slate" />
                    <SummaryCard label="ĐẬU TN" value={calculateClassDetailedStats.metrics.dauTN} rate={calculateClassDetailedStats.metrics.dauTNRate} color="emerald" />
                    <SummaryCard label="HỎNG TN" value={calculateClassDetailedStats.metrics.hongTN} rate={calculateClassDetailedStats.metrics.hongTNRate} color="red" />
                  </div>

                  {/* Failed Graduation List (if any) */}
                  {calculateClassDetailedStats.failedGradStudents.length > 0 && (
                    <div className="bg-bento-card border border-red-200 rounded-2xl overflow-hidden shadow-sm">
                      <div className="bg-red-50 px-6 py-4 border-b border-red-100 flex items-center gap-2">
                        <AlertCircle size={16} className="text-red-600" />
                        <h3 className="text-[11px] font-black text-red-900 uppercase tracking-widest">Danh sách thí sinh hỏng tốt nghiệp (Lớp {selectedClass})</h3>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-[13px]">
                          <thead>
                            <tr className="bg-red-50/30 border-b border-bento-border text-[11px]">
                              <th className="px-6 py-3 font-black text-bento-subtext text-center w-16 border-r border-bento-border">TT</th>
                              <th className="px-6 py-3 font-black text-bento-subtext border-r border-bento-border">SBD</th>
                              <th className="px-6 py-3 font-black text-bento-subtext border-r border-bento-border">HỌ VÀ TÊN</th>
                              <th className="px-6 py-3 font-black text-bento-subtext border-r border-bento-border text-center">ĐIỂM XÉT TN</th>
                              <th className="px-6 py-3 font-black text-red-700">GHI CHÚ</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-bento-border">
                            {calculateClassDetailedStats.failedGradStudents.map((student, idx) => (
                              <tr key={student.sbd} className="hover:bg-red-50/20 transition-colors">
                                <td className="px-6 py-2.5 font-mono text-center text-bento-subtext border-r border-bento-border">{idx + 1}</td>
                                <td className="px-6 py-2.5 font-mono font-bold text-bento-text border-r border-bento-border">{student.sbd}</td>
                                <td className="px-4 py-2.5 font-bold text-bento-text border-r border-bento-border whitespace-nowrap">{student.name}</td>
                                <td className="px-6 py-2.5 font-mono font-black text-center text-red-600 border-r border-bento-border">{String(student.scores["XÉT TN"]).replace(',', '.')}</td>
                                <td className="px-6 py-2.5 text-xs font-bold text-red-700 italic">
                                  {getFailReason(student)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Top Students Table */}
                  <div className="bg-bento-card border border-bento-border rounded-2xl overflow-hidden shadow-sm">
                    <div className="bg-emerald-50 px-6 py-4 border-b border-emerald-100 flex items-center gap-2">
                      <Trophy size={16} className="text-emerald-600" />
                      <h3 className="text-[11px] font-black text-emerald-900 uppercase tracking-widest">TOP THÍ SINH CÓ ĐIỂM THI (TRUNG BÌNH THI) CAO NHẤT</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-[13px]">
                        <thead>
                          <tr className="bg-emerald-50/30 border-b border-bento-border text-[11px]">
                            <th className="px-6 py-3 font-black text-bento-subtext text-center w-16 border-r border-bento-border">TT</th>
                            <th className="px-6 py-3 font-black text-bento-subtext border-r border-bento-border">SBD</th>
                            <th className="px-6 py-3 font-black text-bento-subtext border-r border-bento-border">HỌ VÀ TÊN</th>
                            <th className="px-6 py-3 font-black text-bento-subtext border-r border-bento-border">LỚP</th>
                            <th className="px-6 py-3 font-black text-bento-subtext text-center">ĐIỂM TB THI</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-bento-border">
                          {calculateClassDetailedStats.topStudentsByAvg.map((student, idx) => (
                            <tr key={student.sbd} className="hover:bg-emerald-50/20 transition-colors">
                              <td className="px-6 py-2.5 font-mono text-center text-bento-subtext border-r border-bento-border">{idx + 1}</td>
                              <td className="px-6 py-2.5 font-mono font-bold text-bento-text border-r border-bento-border">{student.sbd}</td>
                              <td className="px-6 py-2.5 font-bold text-bento-text border-r border-bento-border whitespace-nowrap">{student.name}</td>
                              <td className="px-6 py-2.5 font-bold text-bento-text border-r border-bento-border">{student.class}</td>
                              <td className="px-6 py-2.5 font-mono font-black text-center text-lg text-emerald-600">{(student as any).avgScore.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Range distribution Table (by Subject) */}
                  <div className="bg-bento-card border border-bento-border rounded-2xl overflow-hidden shadow-sm">
                    <div className="bg-bento-table-header px-6 py-4 border-b border-bento-border">
                      <h3 className="text-[11px] font-black text-bento-text uppercase tracking-widest">Phân bố điểm theo các bộ môn</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-[13px]">
                        <thead>
                          <tr className="bg-bento-bg/50 border-b border-bento-border text-[11px]">
                            <th rowSpan={2} className="px-6 py-4 font-black text-bento-text text-left border-r border-bento-border uppercase sticky left-0 bg-bento-card">Môn học</th>
                            <th rowSpan={2} className="px-6 py-4 font-black text-bento-text text-center border-r border-bento-border uppercase">Dự thi</th>
                            {calculateClassDetailedStats.ranges.map(r => (
                              <th key={r.label} colSpan={2} className="px-6 py-4 font-black text-bento-text text-center border-r border-bento-border last:border-r-0 uppercase">{r.label}</th>
                            ))}
                            <th colSpan={2} className="px-6 py-4 font-black text-emerald-700 text-center border-l-2 border-emerald-200 uppercase bg-emerald-50/50">TB TRỞ LÊN</th>
                          </tr>
                          <tr className="bg-bento-bg/30 border-b border-bento-border">
                            {calculateClassDetailedStats.ranges.map((_, i) => (
                              <React.Fragment key={i}>
                                <th className="px-4 py-2 text-[10px] font-black text-bento-subtext text-center border-r border-bento-border">SL</th>
                                <th className="px-4 py-2 text-[10px] font-black text-bento-subtext text-center border-r border-bento-border last:border-r-0">TL (%)</th>
                              </React.Fragment>
                            ))}
                            <th className="px-4 py-2 text-[10px] font-black text-emerald-700 text-center border-r border-bento-border border-l-2 border-emerald-200">SL</th>
                            <th className="px-4 py-2 text-[10px] font-black text-emerald-700 text-center">TL (%)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-bento-border">
                          {calculateClassDetailedStats.subjectStats.map((sub, idx) => (
                            <tr key={idx} className="hover:bg-bento-accent/[0.02]">
                              <td className="px-6 py-3 font-black text-bento-text border-r border-bento-border whitespace-nowrap">{sub.subject}</td>
                              <td className="px-6 py-3 font-mono font-bold text-center border-r border-bento-border">{sub.total}</td>
                              {sub.stats.map((s, si) => (
                                <React.Fragment key={si}>
                                  <td className="px-4 py-3 font-mono text-center border-r border-bento-border">{s.count}</td>
                                  <td className="px-4 py-3 font-mono text-center font-bold text-bento-accent border-r border-bento-border last:border-r-0">{s.rate > 0 ? s.rate.toFixed(1) : "-"}</td>
                                </React.Fragment>
                              ))}
                              <td className="px-4 py-3 font-mono text-center border-r border-bento-border border-l-2 border-emerald-200 bg-emerald-50/20 font-bold text-emerald-700">{sub.aboveFive.count}</td>
                              <td className="px-4 py-3 font-mono text-center font-black text-emerald-600 bg-emerald-50/20">{sub.aboveFive.rate > 0 ? sub.aboveFive.rate.toFixed(1) : "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-20 text-bento-subtext font-bold">Không có dữ liệu cho lớp học này.</div>
              )}
            </motion.div>
          )}

          {activeTab === "history" && (
            <motion.div 
              key="history"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="col-span-1 md:col-span-4 space-y-6"
            >
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 bg-bento-card p-8 rounded-2xl border border-bento-border shadow-sm">
                <div className="flex-1">
                  <h3 className="text-2xl font-black text-bento-text uppercase tracking-tight">SO SÁNH KẾT QUẢ THI LẦN 1 VÀ LẦN 2</h3>
                  <p className="text-xs text-bento-subtext font-bold uppercase tracking-widest mt-1">Đối chiếu tiến bộ giữa hai lần thi thử tốt nghiệp</p>
                </div>
                
                <div className="flex flex-wrap gap-3 w-full lg:w-auto">
                  <div className="relative">
                    <input 
                      type="file" 
                      id="history-import" 
                      className="hidden" 
                      accept=".xlsx, .xls"
                      onChange={handleImportComparisonData}
                      disabled={role !== 'admin'}
                    />
                    <label 
                      htmlFor="history-import"
                      className={cn(
                        "flex items-center gap-2 px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all cursor-pointer shadow-lg",
                        role === 'admin' 
                          ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/10" 
                          : "bg-emerald-600/20 text-emerald-600/50 cursor-not-allowed border border-emerald-600/10"
                      )}
                    >
                      <Download size={14} className="rotate-180" /> IMPORT
                    </label>
                  </div>
                  
                  <button 
                    onClick={handleUpdateComparisonData}
                    disabled={role !== 'admin' || updatingComparison || !tempComparisonData}
                    className={cn(
                      "flex items-center gap-2 px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg",
                      role === 'admin' && !updatingComparison && tempComparisonData
                        ? "bg-bento-accent hover:bg-bento-accent/90 text-white shadow-bento-accent/10" 
                        : "bg-bento-accent/20 text-bento-accent/50 cursor-not-allowed border border-bento-accent/10"
                    )}
                  >
                    {updatingComparison ? "ĐANG CẬP NHẬT..." : "CẬP NHẬT"}
                  </button>
                </div>
              </div>

              <div className="bg-bento-card border border-bento-border rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[13px] border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-bento-border divide-x divide-bento-border">
                        <th className="px-6 py-5 font-black text-slate-700 uppercase tracking-tighter text-center sticky left-0 bg-slate-50 z-10" rowSpan={2}>Môn học</th>
                        <th className="px-6 py-4 font-black text-slate-700 uppercase tracking-tighter text-center" colSpan={3}>Tỉ lệ TB trở lên (%)</th>
                        <th className="px-6 py-4 font-black text-slate-700 uppercase tracking-tighter text-center" colSpan={3}>Điểm thi TB (Điểm)</th>
                      </tr>
                      <tr className="bg-slate-50/50 border-b border-bento-border divide-x divide-bento-border">
                        <th className="px-4 py-3 font-black text-slate-500 uppercase text-center text-[10px]">Lần 1</th>
                        <th className="px-4 py-3 font-black text-slate-500 uppercase text-center text-[10px]">Lần 2</th>
                        <th className="px-4 py-3 font-black text-slate-500 uppercase text-center text-[10px]">Tăng/Giảm</th>
                        <th className="px-4 py-3 font-black text-slate-500 uppercase text-center text-[10px]">Lần 1</th>
                        <th className="px-4 py-3 font-black text-slate-500 uppercase text-center text-[10px]">Lần 2</th>
                        <th className="px-4 py-3 font-black text-slate-500 uppercase text-center text-[10px]">Tăng/Giảm</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-bento-border">
                      {comparisonData.length > 0 ? comparisonData.map((row, idx) => {
                        const rateDiff = row.rate2 - row.rate1;
                        const scoreDiff = row.score2 - row.score1;

                        return (
                          <tr key={idx} className="hover:bg-slate-50/50 divide-x divide-bento-border transition-colors">
                            <td className="px-6 py-4 font-black text-slate-700 uppercase tracking-tighter sticky left-0 bg-white shadow-[2px_0_5px_rgba(0,0,0,0.05)] border-r border-bento-border">{row.subject}</td>
                            
                            <td className="px-4 py-4 font-mono font-bold text-center text-slate-600">{row.rate1.toFixed(1)}%</td>
                            <td className="px-4 py-4 font-mono font-black text-center text-slate-800 bg-slate-50/30">{row.rate2.toFixed(1)}%</td>
                            <td className={cn(
                              "px-4 py-4 font-mono font-black text-center",
                              rateDiff > 0 ? "text-emerald-600 bg-emerald-50/20" : rateDiff < 0 ? "text-red-600 bg-red-50/20" : "text-slate-400"
                            )}>
                              {rateDiff > 0 ? `+${rateDiff.toFixed(1)}` : rateDiff.toFixed(1)}%
                            </td>

                            <td className="px-4 py-4 font-mono font-bold text-center text-slate-600">{row.score1.toFixed(2)}</td>
                            <td className="px-4 py-4 font-mono font-black text-center text-slate-800 bg-slate-50/30">{row.score2.toFixed(2)}</td>
                            <td className={cn(
                              "px-4 py-4 font-mono font-black text-center",
                              scoreDiff > 0 ? "text-emerald-600 bg-emerald-50/20" : scoreDiff < 0 ? "text-red-600 bg-red-50/20" : "text-slate-400"
                            )}>
                              {scoreDiff > 0 ? `+${scoreDiff.toFixed(2)}` : scoreDiff.toFixed(2)}
                            </td>
                          </tr>
                        );
                      }) : (
                        <tr>
                          <td colSpan={7} className="px-6 py-20 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">
                            <BarChart3 size={40} className="mx-auto mb-4 opacity-20" />
                            Chưa có dữ liệu so sánh lần trước
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "compare" && (
            <motion.div 
              key="compare"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="col-span-1 md:col-span-4 space-y-6"
            >
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 bg-bento-card p-8 rounded-2xl border border-bento-border shadow-sm">
                <div className="flex-1">
                  <h3 className="text-2xl font-black text-bento-text uppercase tracking-tight">SO SÁNH CỤM CHUYÊN MÔN</h3>
                  <p className="text-xs text-bento-subtext font-bold uppercase tracking-widest mt-1">Đối chiếu kết quả thi giữa các trường trong cụm</p>
                </div>
                
                <div className="flex flex-wrap gap-3 w-full lg:w-auto">
                  <button 
                    onClick={() => setSelectedSchoolIdx(-1)}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all bg-slate-800 text-white hover:bg-black shadow-lg shadow-slate-900/10"
                  >
                    <Layout size={14} /> ĐẦU TRANG
                  </button>

                  <div className="relative">
                    <input 
                      type="file" 
                      id="group-import" 
                      className="hidden" 
                      accept=".xlsx, .xls"
                      onChange={handleImportGroupData}
                      disabled={role !== 'admin'}
                    />
                    <label 
                      htmlFor="group-import"
                      className={cn(
                        "flex items-center gap-2 px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all cursor-pointer shadow-lg",
                        role === 'admin' 
                          ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/10" 
                          : "bg-emerald-600/20 text-emerald-600/50 cursor-not-allowed border border-emerald-600/10"
                      )}
                    >
                      <Download size={14} className="rotate-180" /> IMPORT CỤM
                    </label>
                  </div>
                  
                  <button 
                    onClick={handleUpdateGroupData}
                    disabled={role !== 'admin' || updatingGroup || !tempGroupData}
                    className={cn(
                      "flex items-center gap-2 px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg",
                      role === 'admin' && !updatingGroup && tempGroupData
                        ? "bg-bento-accent hover:bg-bento-accent/90 text-white shadow-bento-accent/10" 
                        : "bg-bento-accent/20 text-bento-accent/50 cursor-not-allowed border border-bento-accent/10"
                    )}
                  >
                    {updatingGroup ? "ĐANG CẬP NHẬT..." : "CẬP NHẬT CỤM"}
                  </button>
                </div>
              </div>

              <div className="bg-bento-card border border-bento-border rounded-2xl p-8 shadow-sm">
                <div className="flex flex-col items-center gap-6">
                  <div className="w-full max-w-md text-center">
                    <label className="text-base font-black text-red-600 uppercase tracking-widest block mb-4 animate-pulse">CHỌN TRƯỜNG ĐỂ ĐỐI SÁNH</label>
                    <select 
                      className="w-full bg-white border-4 border-red-100 px-6 py-4 rounded-xl font-black text-sm uppercase tracking-tight outline-none focus:border-red-500 transition-all appearance-none text-center shadow-lg"
                      value={selectedSchoolIdx}
                      onChange={(e) => setSelectedSchoolIdx(parseInt(e.target.value))}
                    >
                      <option value={-1}>--- BẤM VÀO ĐÂY ĐỂ CHỌN ---</option>
                      {groupData ? groupData.schools.map((school, idx) => (
                        <option key={idx} value={idx}>{getDisplayName(school)}</option>
                      )) : null}
                    </select>
                  </div>

                  {groupData && groupData.schools.length > 0 ? (
                    <div className="w-full space-y-8 animate-in fade-in duration-500">
                      {/* Detailed School Data Table displayed first */}
                      {selectedSchoolIdx !== -1 && (
                        <div className="space-y-6 animate-in slide-in-from-top-4 duration-500">
                          <div className="flex items-center gap-4">
                            <div className="h-0.5 w-full bg-red-100 flex-1"></div>
                            <h2 className="text-xl font-black text-red-600 uppercase tracking-tighter whitespace-nowrap">CHI TIẾT: {getDisplayName(groupData.schools[selectedSchoolIdx])}</h2>
                            <div className="h-0.5 w-full bg-red-100 flex-1"></div>
                          </div>
                          
                          <div className="bg-white border-2 border-red-50 rounded-2xl overflow-hidden shadow-xl overflow-x-auto min-h-[300px] flex flex-col">
                            {loadingSchoolDetail ? (
                              <div className="flex-1 flex flex-col items-center justify-center py-20">
                                <div className="w-12 h-12 border-4 border-red-200 border-t-red-600 rounded-full animate-spin mb-4" />
                                <p className="text-red-600 font-black uppercase tracking-widest text-xs">Đang tải dữ liệu trường...</p>
                              </div>
                            ) : activeSchoolDetail ? (
                              <table className="w-full text-[12px] border-collapse min-w-max">
                                <thead>
                                  {activeSchoolDetail.slice(0, 1).map((row, rIdx) => {
                                    const processedCols = row.filter((c: any) => String(c).toUpperCase() !== 'TT');
                                    return (
                                      <tr key={rIdx} className="bg-slate-100 border-b border-bento-border divide-x divide-bento-border">
                                        {processedCols.map((cell: any, cIdx: number) => {
                                          const isSubjectOrTotal = cIdx < 2;
                                          const isTbTroLen = String(cell).toUpperCase().includes("TB TRỞ LÊN");
                                          if (isSubjectOrTotal) {
                                            return <th key={cIdx} className="px-3 py-4 font-black text-slate-700 uppercase tracking-tighter text-center" rowSpan={1}>{cell}</th>;
                                          }
                                          if (isTbTroLen) {
                                            return (
                                              <React.Fragment key={cIdx}>
                                                <th className="px-2 py-4 font-black text-slate-700 uppercase tracking-tighter text-center" colSpan={2}>{cell}</th>
                                                <th key="pvd_tb" className="px-2 py-4 font-black text-red-600 uppercase tracking-tighter text-center bg-red-50" colSpan={1}>TB TRỞ LÊN (PVĐ)</th>
                                              </React.Fragment>
                                            );
                                          }
                                          return <th key={cIdx} className="px-2 py-4 font-black text-slate-700 uppercase tracking-tighter text-center" colSpan={2}>{cell}</th>;
                                        })}
                                      </tr>
                                    );
                                  })}
                                  <tr className="bg-slate-50 border-b border-bento-border divide-x divide-bento-border">
                                    {activeSchoolDetail[0].filter((c: any) => String(c).toUpperCase() !== 'TT').map((cell: any, cIdx: number) => {
                                      if (cIdx < 2) return <th key={cIdx} className="px-1 py-1"></th>;
                                      const isTbTroLen = String(cell).toUpperCase().includes("TB TRỞ LÊN");
                                      if (isTbTroLen) {
                                        return (
                                          <React.Fragment key={cIdx}>
                                            <th className="px-1 py-1 text-[10px] font-black text-slate-500">SL</th>
                                            <th className="px-1 py-1 text-[10px] font-black text-red-500">TL%</th>
                                            <th key="pvd_sub" className="px-1 py-1 text-[10px] font-black text-red-700 bg-red-50">TL%</th>
                                          </React.Fragment>
                                        );
                                      }
                                      return (
                                        <React.Fragment key={cIdx}>
                                          <th className="px-1 py-1 text-[10px] font-black text-slate-500">SL</th>
                                          <th className="px-1 py-1 text-[10px] font-black text-red-500">TL%</th>
                                        </React.Fragment>
                                      );
                                    })}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-bento-border">
                                  {activeSchoolDetail.slice(1).map((row, rIdx) => {
                                    if (row.length < 2) return null;
                                    
                                    const headRow = activeSchoolDetail[0];
                                    const ttIdx = headRow.findIndex((c: any) => String(c).toUpperCase() === 'TT');
                                    let filteredRow = row;
                                    if (ttIdx !== -1) filteredRow = row.filter((_, idx) => idx !== ttIdx);

                                    // Skip header/noise rows (like Môn, TT or numeric noisy rows)
                                    const subNameCol = filteredRow[0] ? String(filteredRow[0]).trim().toUpperCase() : "";
                                    if (!subNameCol || subNameCol === "MÔN" || subNameCol === "MÔN HỌC" || /^\d+$/.test(subNameCol) || subNameCol === "NULL") return null;
                                    
                                    const totalStudents = typeof filteredRow[1] === 'number' ? filteredRow[1] : parseFloat(String(filteredRow[1]));
                                    if (isNaN(totalStudents)) return null;

                                    return (
                                      <tr key={rIdx} className="hover:bg-red-50/30 divide-x divide-bento-border transition-colors">
                                        {filteredRow.map((cell: any, cIdx: number) => {
                                          const value = cell !== undefined && cell !== null ? cell : "";
                                          const displayVal = typeof value === 'number' ? value.toLocaleString('en-US') : value;
                                          if (cIdx === 0) return <td key={cIdx} className="px-3 py-3 font-black text-slate-700 text-left sticky left-0 bg-white whitespace-nowrap border-r border-bento-border shadow-[2px_0_5px_rgba(0,0,0,0.05)]">{displayVal}</td>;
                                          if (cIdx === 1) return <td key={cIdx} className="px-3 py-3 text-center font-mono font-black text-slate-800 bg-slate-50/50">{displayVal}</td>;
                                          const numVal = typeof cell === 'number' ? cell : parseFloat(String(cell));
                                          const percentage = (!isNaN(numVal) && totalStudents > 0) ? ((numVal / totalStudents) * 100).toFixed(1) : "0.0";
                                          
                                          // Check if this is the "TB TRỞ LÊN" column to add PVD rate
                                          const isTbTroLen = String(headRow.filter((c: any) => String(c).toUpperCase() !== 'TT')[cIdx]).toUpperCase().includes("TB TRỞ LÊN");

                                          if (isTbTroLen) {
                                            // Helper logic to get PVD rate
                                            let pvdRateValue = "-";
                                            if (pvdSchoolDetail && pvdSchoolDetail.length > 0) {
                                              const sName = subNameCol;
                                              const pvdHead = pvdSchoolDetail[0];
                                              
                                              // Find which column in PVĐ data is the subject name (usually index 0 or 1 if TT exists)
                                              const pvdSubjectColIdx = pvdHead.findIndex((c: any) => 
                                                String(c).toUpperCase().includes("MÔN") || 
                                                String(c).toUpperCase() === "TT" ||
                                                (pvdSchoolDetail[1] && typeof pvdSchoolDetail[1][pvdHead.indexOf(c)] === 'string')
                                              );
                                              
                                              // Find the row matches the subject name
                                              const pvdRowMatch = pvdSchoolDetail.find(r => {
                                                if (!r || r.length < 2) return false;
                                                const rSub0 = String(r[0] || "").trim().toUpperCase();
                                                const rSub1 = String(r[1] || "").trim().toUpperCase();
                                                return rSub0 === sName || rSub1 === sName || 
                                                       sName.includes(rSub0) && rSub0.length > 2 || 
                                                       rSub0.includes(sName) && sName.length > 2;
                                              });

                                              if (pvdRowMatch) {
                                                const pvdTbIdx = pvdHead.findIndex((c: any) => String(c).toUpperCase().includes("TB TRỞ LÊN"));
                                                // Find "Dự thi" column in PVD header
                                                const pvdTotalIdx = pvdHead.findIndex((c: any) => 
                                                  String(c).toUpperCase().includes("DỰ THI") || 
                                                  String(c).toUpperCase().includes("TỔNG") ||
                                                  String(c).toUpperCase() === "TS"
                                                );

                                                if (pvdTbIdx !== -1 && pvdTotalIdx !== -1) {
                                                  const pvdTotalValue = typeof pvdRowMatch[pvdTotalIdx] === 'number' ? pvdRowMatch[pvdTotalIdx] : parseFloat(String(pvdRowMatch[pvdTotalIdx]));
                                                  const pvdTbValue = typeof pvdRowMatch[pvdTbIdx] === 'number' ? pvdRowMatch[pvdTbIdx] : parseFloat(String(pvdRowMatch[pvdTbIdx]));
                                                  
                                                  if (!isNaN(pvdTotalValue) && !isNaN(pvdTbValue) && pvdTotalValue > 0) {
                                                    pvdRateValue = ((pvdTbValue / pvdTotalValue) * 100).toFixed(1);
                                                  } else if (pvdTotalValue === 0) {
                                                    pvdRateValue = "0.0";
                                                  }
                                                }
                                              }
                                            }

                                            return (
                                              <React.Fragment key={cIdx}>
                                                <td className="px-2 py-3 text-center font-mono font-black text-bento-text">{displayVal}</td>
                                                <td className="px-2 py-3 text-center font-mono font-black text-red-600 bg-red-50/20">{percentage}%</td>
                                                <td key="pvd_td" className="px-2 py-3 text-center font-mono font-black text-red-700 bg-red-100/40">{pvdRateValue === "-" ? "-" : pvdRateValue + "%"}</td>
                                              </React.Fragment>
                                            );
                                          }

                                          return (
                                            <React.Fragment key={cIdx}>
                                              <td className="px-2 py-3 text-center font-mono font-black text-bento-text">{displayVal}</td>
                                              <td className="px-2 py-3 text-center font-mono font-black text-red-600 bg-red-50/20">{percentage}%</td>
                                            </React.Fragment>
                                          );
                                        })}
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            ) : (
                              <div className="flex-1 flex flex-col items-center justify-center py-20 opacity-40">
                                <AlertCircle size={48} className="text-slate-300 mb-4" />
                                <p className="text-slate-500 font-black uppercase">Không tìm thấy dữ liệu chi tiết cho trường này</p>
                              </div>
                            )}
                          </div>

                          {/* Comparison Charts displayed sequentially (one per row) after the table */}
                          {!loadingSchoolDetail && activeSchoolDetail && (
                            <div className="grid grid-cols-1 gap-12 pt-8">
                              {activeSchoolDetail.slice(1).map((row, rIdx) => {
                                if (!row || row.length < 2) return null;
                                
                                const headerRow = activeSchoolDetail[0] || [];
                                const ttIdx = headerRow.findIndex((c: any) => String(c || "").toUpperCase().trim() === 'TT');
                                
                                // Subject name column detection
                                let rawName = (ttIdx === 0) ? String(row[1] || "") : String(row[0] || "");
                                const subjectNameCleaned = rawName.replace(/^[\d\s.]+/, "").trim().toUpperCase();
                                
                                // Skip if header or numeric noisy rows
                                if (!subjectNameCleaned || /^\d+$/.test(subjectNameCleaned) || subjectNameCleaned === "MÔN" || subjectNameCleaned === "MÔN HỌC" || subjectNameCleaned === "TT") return null; 

                                const subjectName = subjectNameCleaned === "VĂN" ? "NGỮ VĂN" : subjectNameCleaned;
                                
                                const pvdRow = pvdSchoolDetail?.slice(1).find(r => {
                                  if (!r || r.length < 2) return false;
                                  let pRaw = (ttIdx === 0) ? String(r[1] || "") : String(r[0] || "");
                                  const pSub = pRaw.replace(/^[\d\s.]+/, "").trim().toUpperCase();
                                  const pSubFinal = pSub === "VĂN" ? "NGỮ VĂN" : pSub;
                                  return pSubFinal === subjectName;
                                });

                                const getRowData = (targetRow: any[]) => {
                                  let filtered = targetRow;
                                  if (ttIdx !== -1) filtered = targetRow.filter((_, idx) => idx !== ttIdx);
                                  const total = typeof filtered[1] === 'number' ? filtered[1] : (parseFloat(String(filtered[1])) || 0);
                                  return { filtered, total };
                                };

                                const currentInfo = getRowData(row);
                                const pvdInfo = pvdRow ? getRowData(pvdRow) : { filtered: [], total: 0 };
                                
                                // Get header row for dynamic column detection
                                const headerRowRaw = activeSchoolDetail[0] || [];
                                const colHeader = headerRowRaw.filter((_, idx) => idx !== ttIdx);
                                
                                const findRangeIdx = (patterns: string[]) => {
                                  const found = colHeader.findIndex(h => {
                                    const s = String(h || "").toLowerCase();
                                    return patterns.some(p => s.includes(p));
                                  });
                                  return found;
                                };

                                // Detect correct column indices for the 5 requested ranges
                                const slIndices = [
                                  findRangeIdx(["0-3.4", "0-3,4", "kém"]),
                                  findRangeIdx(["3.5-4.9", "3,5-4,9", "yếu"]),
                                  findRangeIdx(["5.0-6.4", "5,0-6,4", "trung bình", "tb"]),
                                  findRangeIdx(["6.5-7.9", "6,5-7,9", "khá"]),
                                  findRangeIdx(["8.0-10", "8,0-10", "giỏi"])
                                ];

                                const ranges = ["0-3.4", "3.5-4.9", "5.0-6.4", "6.5-7.9", "8.0-10"];
                                const chartData = ranges.map((rangeLabel, idx) => {
                                  // Use detected index or fallback to old interleaved logic
                                  const colIdx = (slIndices[idx] !== -1) ? slIndices[idx] : (2 + (idx * 2));
                                  const currentVal = typeof currentInfo.filtered[colIdx] === 'number' ? currentInfo.filtered[colIdx] : (parseFloat(String(currentInfo.filtered[colIdx])) || 0);
                                  const pvdVal = typeof pvdInfo.filtered[colIdx] === 'number' ? pvdInfo.filtered[colIdx] : (parseFloat(String(pvdInfo.filtered[colIdx])) || 0);
                                  return {
                                    range: rangeLabel,
                                    current: currentInfo.total > 0 ? Number(((currentVal / currentInfo.total) * 100).toFixed(1)) : 0,
                                    pvd: pvdInfo.total > 0 ? Number(((pvdVal / pvdInfo.total) * 100).toFixed(1)) : 0
                                  };
                                });

                                // Statistical calculation from ranges (frequency distribution)
                                const calculateSubjectStats = (info: { filtered: any[], total: number }) => {
                                  // Use the same detected indices
                                  const freq = slIndices.map((actualIdx, i) => {
                                    const colToUse = (actualIdx !== -1) ? actualIdx : (2 + i * 2);
                                    const val = info.filtered[colToUse];
                                    if (typeof val === 'number') return val;
                                    const p = parseFloat(String(val || "0"));
                                    return isNaN(p) ? 0 : p;
                                  });

                                  // Midpoints from absolute range limits: 0-3.4 (1.7), 3.5-4.9 (4.2), 5-6.4 (5.7), 6.5-7.9 (7.2), 8.0-10 (9.0)
                                  const midpoints = [1.7, 4.2, 5.7, 7.2, 9.0];
                                  const boundaries = [0, 3.45, 4.95, 6.45, 7.95, 10.0];

                                  const effectiveTotal = freq.reduce((a, b) => a + b, 0);
                                  if (effectiveTotal <= 0) return { avg: "---", median: "---", stdDev: "---" };

                                  // Mean (ĐTB)
                                  let sum = 0;
                                  freq.forEach((f, i) => sum += f * midpoints[i]);
                                  const avg = sum / effectiveTotal;

                                  // Std Dev (Độ lệch chuẩn)
                                  let varianceSum = 0;
                                  freq.forEach((f, i) => varianceSum += f * Math.pow(midpoints[i] - avg, 2));
                                  const stdDev = Math.sqrt(varianceSum / effectiveTotal);

                                  // Median (Trung vị) interpolation
                                  const n2 = effectiveTotal / 2;
                                  let cumFreq = 0;
                                  let medianValue = 0;
                                  for (let i = 0; i < freq.length; i++) {
                                    const f = freq[i];
                                    if (cumFreq + f >= n2) {
                                      const L = boundaries[i];
                                      const F = cumFreq;
                                      const h = boundaries[i+1] - L;
                                      medianValue = L + ((n2 - F) / (f || 1)) * h;
                                      break;
                                    }
                                    cumFreq += f;
                                  }

                                  return { 
                                    avg: isFinite(avg) ? avg.toFixed(2) : "---", 
                                    median: isFinite(medianValue) ? medianValue.toFixed(2) : "---", 
                                    stdDev: isFinite(stdDev) ? stdDev.toFixed(2) : "---" 
                                  };
                                };

                                const currentStats = calculateSubjectStats(currentInfo);
                                const pvdStats = calculateSubjectStats(pvdInfo);

                                // Generate non-academic assessment
                                const getAssessment = () => {
                                  const schoolName = groupData.schools[selectedSchoolIdx];
                                  if (!schoolName || schoolName === 'PVĐ') return null;

                                  const cAvg = parseFloat(currentStats.avg);
                                  const pAvg = parseFloat(pvdStats.avg);
                                  const cMed = parseFloat(currentStats.median);
                                  const pMed = parseFloat(pvdStats.median);
                                  const cStd = parseFloat(currentStats.stdDev);
                                  const pStd = parseFloat(pvdStats.stdDev);

                                  if (isNaN(cAvg) || isNaN(pAvg)) return null;

                                  let text = "";
                                  const diff = cAvg - pAvg;
                                  const sName = getDisplayName(schoolName);

                                  if (Math.abs(diff) < 0.15) {
                                    text = `Hai trường ở môn này "ngang ngửa" nhau, trình độ học sinh khá tương đồng. `;
                                  } else if (diff > 0) {
                                    text = `${sName} đang có phần "nhỉnh" hơn PVĐ về mặt bằng chung ở môn này. `;
                                  } else {
                                    text = `PVĐ đang có ưu thế hơn ${sName} một chút về điểm số ở môn học này. `;
                                  }

                                  if (cStd < pStd - 0.2) {
                                    text += `Học sinh ${sName} làm bài có vẻ "chắc tay" và điểm số tập trung hơn.`;
                                  } else if (pStd < cStd - 0.2) {
                                    text += `Điểm số của PVĐ đồng đều hơn, ít xảy ra tình trạng chênh lệch quá lớn giữa các nhóm điểm.`;
                                  } else {
                                    text += `Cả hai trường đều có độ phân hóa học sinh khá giống nhau.`;
                                  }

                                  return text;
                                };

                                const assessmentText = getAssessment();

                                return (
                                  <div key={rIdx} className="bg-white border-2 border-slate-50 rounded-3xl p-8 shadow-xl hover:shadow-2xl transition-all overflow-hidden">
                                    <h4 className="text-xl font-black text-slate-800 mb-8 border-l-8 border-bento-accent pl-4 uppercase tracking-tighter">
                                      BIỂU ĐỒ MÔN: <span className="text-bento-accent">{subjectName}</span>
                                    </h4>
                                    <div className="flex flex-col lg:flex-row gap-10">
                                      <div className="flex-1 min-h-[350px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="range" axisLine={false} tickLine={false} tick={{ fill: '#000000', fontSize: 11, fontWeight: 900 }} dy={10} />
                                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#000000', fontSize: 11, fontWeight: 900 }} unit="%" dx={-10} />
                                            <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 900, textTransform: 'uppercase' }} />
                                            <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', paddingBottom: '30px' }} />
                                            <Bar name={groupData.schools[selectedSchoolIdx]} dataKey="current" fill="#4f46e5" radius={[6, 6, 0, 0]} barSize={35} />
                                            <Bar name="PVĐ" dataKey="pvd" fill="#ef4444" radius={[6, 6, 0, 0]} barSize={35} />
                                          </BarChart>
                                        </ResponsiveContainer>
                                      </div>
                                      <div className="w-full lg:w-80 shrink-0">
                                        <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 h-full">
                                          <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">BẢNG THỐNG KÊ CHI TIẾT</h5>
                                          <table className="w-full text-xs">
                                            <thead>
                                              <tr className="border-b-2 border-slate-200">
                                                <th className="text-left py-2 font-black text-slate-500 uppercase italic">CHỈ SỐ</th>
                                                <th className="text-center py-2 font-black text-indigo-600 uppercase italic">{groupData.schools[selectedSchoolIdx]}</th>
                                                <th className="text-center py-2 font-black text-red-600 uppercase italic">PVĐ</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 font-mono">
                                              <tr>
                                                <td className="py-4 font-bold text-slate-600">SỐ THÍ SINH</td>
                                                <td className="text-center font-black text-slate-900">{currentInfo.total}</td>
                                                <td className="text-center font-black text-slate-900">{pvdInfo.total}</td>
                                              </tr>
                                              <tr>
                                                <td className="py-4 font-bold text-slate-600">ĐIỂM TB</td>
                                                <td className="text-center font-black text-indigo-700">{currentStats.avg}</td>
                                                <td className="text-center font-black text-red-700">{pvdStats.avg}</td>
                                              </tr>
                                              <tr>
                                                <td className="py-4 font-bold text-slate-600">TRUNG VỊ</td>
                                                <td className="text-center font-black text-slate-900">{currentStats.median}</td>
                                                <td className="text-center font-black text-slate-900">{pvdStats.median}</td>
                                              </tr>
                                              <tr>
                                                <td className="py-4 font-bold text-slate-600">ĐỘ LỆCH CHUẨN</td>
                                                <td className="text-center font-black text-slate-900">{currentStats.stdDev}</td>
                                                <td className="text-center font-black text-slate-900">{pvdStats.stdDev}</td>
                                              </tr>
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>
                                    </div>
                                    {assessmentText && (
                                      <div className="mt-8 p-6 bg-slate-50 rounded-2xl border-l-4 border-indigo-500 italic text-slate-600 text-sm leading-relaxed animate-in fade-in slide-in-from-bottom-2 duration-700">
                                        <div className="flex items-start gap-3">
                                          <div className="mt-1">
                                            <div className="w-2 h-2 rounded-full bg-indigo-400"></div>
                                          </div>
                                          <p className="font-medium">
                                            <span className="font-black text-slate-800 not-italic uppercase tracking-tighter mr-2">Đánh giá chung:</span>
                                            {assessmentText}
                                          </p>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Summary table - only show when no school is selected */}
                      {selectedSchoolIdx === -1 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                          <div className="flex items-center gap-4 pt-4">
                            <div className="h-px flex-1 bg-bento-border"></div>
                            <h2 className="text-xl font-black text-bento-text uppercase tracking-tighter">THÔNG TIN THÍ SINH DỰ THI</h2>
                            <div className="h-px flex-1 bg-bento-border"></div>
                          </div>

                          <div className="bg-white border border-bento-border rounded-2xl overflow-hidden shadow-inner">
                            <table className="w-full text-[11px] border-collapse bg-white">
                              <thead>
                                <tr className="bg-slate-100 border-b border-bento-border">
                                  <th className="px-3 py-4 text-left font-black text-slate-700 uppercase tracking-tighter border-r border-bento-border bg-slate-100 w-40">MÔN</th>
                                  {groupData.schools.map((school, sIdx) => (
                                    <th key={sIdx} className="px-2 py-4 text-center font-black text-bento-accent uppercase tracking-tighter border-r border-bento-border last:border-r-0">
                                      {getDisplayName(school)}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-bento-border">
                                {groupData.metrics.map((m, idx) => (
                                  <tr key={idx} className={cn("hover:bg-bento-accent/[0.04] transition-colors", idx % 2 === 1 ? "bg-slate-50/30" : "")}>
                                    <td className="px-3 py-3 font-bold text-slate-600 border-r border-bento-border bg-slate-50/30 uppercase">{m.label}</td>
                                    {m.values.map((v, vIdx) => {
                                      const rawVal = v !== undefined && v !== null ? v : "-";
                                      const displayVal = typeof rawVal === 'number' 
                                        ? rawVal.toLocaleString('en-US') 
                                        : (!isNaN(parseFloat(String(rawVal))) ? parseFloat(String(rawVal)).toLocaleString('en-US') : rawVal);

                                      return (
                                        <td key={vIdx} className="px-2 py-3 text-center font-mono font-black text-bento-text border-r border-bento-border last:border-r-0 text-xs">
                                          {displayVal}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-20">
                      <div className="bg-slate-100/50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                        <AlertCircle className="text-slate-300 w-10 h-10" />
                      </div>
                      <p className="text-bento-subtext font-bold uppercase tracking-widest text-sm">Chưa có dữ liệu cụm chuyên môn</p>
                      <p className="text-[10px] text-bento-subtext/60 mt-2">Vui lòng Import file excel (Sheet DUTHI) để bắt đầu so sánh</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function SummaryCard({ label, value, rate, color = "accent" }: { label: string, value: number, rate?: number, color?: string }) {
  const colorMap: any = {
    accent: "text-bento-accent bg-bento-accent/5",
    red: "text-red-600 bg-red-50",
    orange: "text-orange-600 bg-orange-50",
    emerald: "text-emerald-600 bg-emerald-50",
    slate: "text-slate-600 bg-slate-50"
  };
  
  return (
    <div className="bg-bento-card border border-bento-border p-6 rounded-2xl">
      <p className="text-[10px] font-black text-bento-subtext uppercase tracking-widest mb-2">{label}</p>
      <div className="flex items-baseline gap-2">
        <p className={cn("text-4xl font-black", colorMap[color] ? colorMap[color].split(' ')[0] : "text-bento-text")}>{value}</p>
        {rate !== undefined && (
          <p className="text-lg font-black text-bento-subtext opacity-50">({rate.toFixed(1)}%)</p>
        )}
      </div>
    </div>
  );
}

function StatRow({ label, value, highlight = false, color }: { label: string, value: any, highlight?: boolean, color?: string }) {
  const colorMap: any = {
    red: "text-red-600 font-black",
    emerald: "text-emerald-600 font-black",
  };
  
  return (
    <tr className={cn(highlight ? "bg-bento-accent/5" : "")}>
      <td className="px-5 py-4 font-bold text-bento-subtext">{label}</td>
      <td className={cn("px-5 py-4 text-right font-mono tabular-nums text-lg", highlight ? "font-black text-bento-accent" : "font-bold text-bento-text", color && colorMap[color])}>
        {value}
      </td>
    </tr>
  );
}

function NavItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-4 w-full px-5 py-3.5 rounded-xl transition-all font-black text-[11px] uppercase tracking-widest border",
        active 
          ? "bg-bento-accent/10 text-bento-accent border-bento-accent/30 shadow-lg shadow-bento-accent/5" 
          : "text-bento-subtext hover:bg-bento-accent/5 hover:text-bento-text border-transparent"
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}


