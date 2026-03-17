import { useState, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { 
  ArrowLeft, Search, Plus, Edit2, Trash2, User, FileSpreadsheet, FileText, Save
} from 'lucide-react';
import { students as initialStudents } from '@/data/store';
import type { Student } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface StudentManagementSectionProps {
  onBack: () => void;
}

export default function StudentManagementSection({ onBack }: StudentManagementSectionProps) {
  const [students, setStudents] = useState<Student[]>(initialStudents);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [filterProgram, setFilterProgram] = useState('');
  const [filterYear, setFilterYear] = useState('');

  const sectionRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Form state for adding/editing
  const [formData, setFormData] = useState({
    studentId: '',
    name: '',
    program: '',
    yearLevel: 1,
    section: '',
  });

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        contentRef.current,
        { y: '6vh', opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, ease: 'power2.out' }
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  const filteredStudents = students.filter(student => {
    const matchesSearch = 
      student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.studentId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesProgram = !filterProgram || student.program === filterProgram;
    const matchesYear = !filterYear || student.yearLevel.toString() === filterYear;
    return matchesSearch && matchesProgram && matchesYear;
  });

  const programs = [...new Set(students.map(s => s.program))];
  const yearLevels = [...new Set(students.map(s => s.yearLevel))].sort();

  const handleAddStudent = () => {
    const newStudent: Student = {
      id: Date.now().toString(),
      ...formData,
    };
    setStudents([...students, newStudent]);
    setShowAddModal(false);
    setFormData({ studentId: '', name: '', program: '', yearLevel: 1, section: '' });
  };

  const handleEditStudent = () => {
    if (editingStudent) {
      setStudents(students.map(s => s.id === editingStudent.id ? { ...editingStudent, ...formData } : s));
      setEditingStudent(null);
      setFormData({ studentId: '', name: '', program: '', yearLevel: 1, section: '' });
    }
  };

  const handleDeleteStudent = (id: string) => {
    if (confirm('Are you sure you want to delete this student?')) {
      setStudents(students.filter(s => s.id !== id));
    }
  };

  const openEditModal = (student: Student) => {
    setEditingStudent(student);
    setFormData({
      studentId: student.studentId,
      name: student.name,
      program: student.program,
      yearLevel: student.yearLevel,
      section: student.section,
    });
  };

  const openAddModal = () => {
    setEditingStudent(null);
    setFormData({ studentId: '', name: '', program: '', yearLevel: 1, section: '' });
    setShowAddModal(true);
  };

  return (
    <section 
      ref={sectionRef}
      className="min-h-screen w-full gradient-bg-orange relative overflow-hidden py-20 lg:py-24"
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-40 left-20 w-72 h-72 rounded-full bg-white blur-3xl" />
        <div className="absolute bottom-40 right-20 w-96 h-96 rounded-full bg-white blur-3xl" />
      </div>

      {/* Content */}
      <div ref={contentRef} className="relative z-10 w-full px-4 sm:px-6 lg:px-8 xl:px-12">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="p-2 rounded-xl hover:bg-white/50 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-dark" />
            </button>
            <div>
              <h1 className="font-display font-bold text-2xl lg:text-3xl text-dark">
                Student Management
              </h1>
              <p className="text-text-secondary text-sm">
                Manage student records and information
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button className="glass-button px-4 py-2.5 flex items-center gap-2 text-sm">
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Upload CSV</span>
            </button>
            <button className="glass-button px-4 py-2.5 flex items-center gap-2 text-sm">
              <FileSpreadsheet className="w-4 h-4" />
              <span className="hidden sm:inline">Upload Excel</span>
            </button>
            <button 
              onClick={openAddModal}
              className="btn-primary px-4 py-2.5 flex items-center gap-2 text-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Add Student</span>
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="glass-card p-4 mb-4 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
            <input
              type="text"
              placeholder="Search students..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="glass-input pl-10 pr-4 py-2 text-sm w-full"
            />
          </div>
          <select
            value={filterProgram}
            onChange={(e) => setFilterProgram(e.target.value)}
            className="glass-input px-4 py-2 text-sm"
          >
            <option value="">All Programs</option>
            {programs.map(program => (
              <option key={program} value={program}>{program}</option>
            ))}
          </select>
          <select
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
            className="glass-input px-4 py-2 text-sm"
          >
            <option value="">All Years</option>
            {yearLevels.map(year => (
              <option key={year} value={year}>{year}{getOrdinalSuffix(year)} Year</option>
            ))}
          </select>
        </div>

        {/* Students Table */}
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="glass-table">
              <thead>
                <tr>
                  <th>Student ID</th>
                  <th>Name</th>
                  <th>Program</th>
                  <th>Year</th>
                  <th>Section</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student) => (
                  <tr key={student.id} className="group">
                    <td className="font-medium text-dark">{student.studentId}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-red/10 flex items-center justify-center">
                          <User className="w-4 h-4 text-red" />
                        </div>
                        <span className="font-medium text-dark">{student.name}</span>
                      </div>
                    </td>
                    <td className="text-text-secondary">{student.program}</td>
                    <td className="text-text-secondary">{student.yearLevel}{getOrdinalSuffix(student.yearLevel)} Year</td>
                    <td className="text-text-secondary">{student.section}</td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEditModal(student)}
                          className="p-2 rounded-lg hover:bg-white/50 transition-colors"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4 text-blue-600" />
                        </button>
                        <button
                          onClick={() => handleDeleteStudent(student.id)}
                          className="p-2 rounded-lg hover:bg-white/50 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4 text-red" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {filteredStudents.length === 0 && (
            <div className="text-center py-12 text-text-secondary">
              <User className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>No students found</p>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="mt-4 flex flex-wrap gap-4 text-sm text-text-secondary">
          <span>Total Students: <strong className="text-dark">{students.length}</strong></span>
          <span>Filtered: <strong className="text-dark">{filteredStudents.length}</strong></span>
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Dialog open={showAddModal || !!editingStudent} onOpenChange={() => {
        setShowAddModal(false);
        setEditingStudent(null);
      }}>
        <DialogContent className="glass-card-strong max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">
              {editingStudent ? 'Edit Student' : 'Add New Student'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            editingStudent ? handleEditStudent() : handleAddStudent();
          }} className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-dark mb-1.5">Student ID</label>
              <input
                type="text"
                value={formData.studentId}
                onChange={(e) => setFormData({ ...formData, studentId: e.target.value })}
                placeholder="e.g., 2021-00001"
                className="glass-input w-full px-4 py-3 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark mb-1.5">Full Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Juan Dela Cruz"
                className="glass-input w-full px-4 py-3 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark mb-1.5">Program</label>
              <input
                type="text"
                value={formData.program}
                onChange={(e) => setFormData({ ...formData, program: e.target.value })}
                placeholder="e.g., BS Computer Science"
                className="glass-input w-full px-4 py-3 text-sm"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-dark mb-1.5">Year Level</label>
                <select
                  value={formData.yearLevel}
                  onChange={(e) => setFormData({ ...formData, yearLevel: parseInt(e.target.value) })}
                  className="glass-input w-full px-4 py-3 text-sm"
                >
                  {[1, 2, 3, 4].map(year => (
                    <option key={year} value={year}>{year}{getOrdinalSuffix(year)} Year</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-dark mb-1.5">Section</label>
                <input
                  type="text"
                  value={formData.section}
                  onChange={(e) => setFormData({ ...formData, section: e.target.value })}
                  placeholder="e.g., A"
                  className="glass-input w-full px-4 py-3 text-sm"
                  required
                />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  setEditingStudent(null);
                }}
                className="btn-secondary flex-1 py-3"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary flex-1 py-3 flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>{editingStudent ? 'Save Changes' : 'Add Student'}</span>
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function getOrdinalSuffix(num: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = num % 100;
  return suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0];
}
