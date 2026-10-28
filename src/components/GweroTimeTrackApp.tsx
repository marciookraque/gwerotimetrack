
"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { usePathname } from "next/navigation";
import { signOut } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import CategoryIconPicker from "@/components/CategoryIconPicker";

type Category = {
  id: string;
  name: string;
  icon: string;
  color: string;
};

type TimeEntry = {
  id: number;
  durationMs: number;
  date: string;
  category: string;
};

type Task = {
  id: number;
  title: string;
  category: string;
  done: boolean;
  entries: TimeEntry[];
  createdAt: string;
  completedAt?: string;
};

type Section = "dashboard" | "tasks" | "reports";
type Period = "today" | "7days" | "30days" | "all";

const DEFAULT_CATEGORIES: Category[] = [
  { id: "default-trabalho", name: "Trabalho", icon: "💼", color: "bg-cyan-400" },
  { id: "default-estudos", name: "Estudos", icon: "📚", color: "bg-violet-400" },
  { id: "default-projectos", name: "Projectos", icon: "🚀", color: "bg-amber-400" },
  { id: "default-reunioes", name: "Reuniões", icon: "🤝", color: "bg-emerald-400" },
  { id: "default-pessoal", name: "Pessoal", icon: "🌱", color: "bg-pink-400" },
  { id: "default-outros", name: "Outros", icon: "📌", color: "bg-slate-400" },
];

const COLOR_OPTIONS = [
  { label: "Turquesa", value: "bg-cyan-400" },
  { label: "Violeta", value: "bg-violet-400" },
  { label: "Amarelo", value: "bg-amber-400" },
  { label: "Verde", value: "bg-emerald-400" },
  { label: "Rosa", value: "bg-pink-400" },
  { label: "Azul", value: "bg-blue-400" },
  { label: "Laranja", value: "bg-orange-400" },
  { label: "Verde-lima", value: "bg-lime-400" },
  { label: "Fúcsia", value: "bg-fuchsia-400" },
  { label: "Cinzento", value: "bg-slate-400" },
];

function formatTime(ms: number, showMs = false) {
  const safe = Math.max(0, Math.floor(ms));
  const seconds = Math.floor(safe / 1000);
  const time = [
    String(Math.floor(seconds / 3600)).padStart(2, "0"),
    String(Math.floor((seconds % 3600) / 60)).padStart(2, "0"),
    String(seconds % 60).padStart(2, "0"),
  ].join(":");

  return showMs
    ? `${time}.${String(safe % 1000).padStart(3, "0")}`
    : time;
}

function taskTime(task: Task) {
  return task.entries.reduce((sum, entry) => sum + entry.durationMs, 0);
}

function formatDate(value: string, includeTime = false) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Data indisponível";

  return date.toLocaleString(
    "pt-PT",
    includeTime
      ? { dateStyle: "short", timeStyle: "short" }
      : { dateStyle: "short" }
  );
}

function isInPeriod(dateString: string, period: Period, now: Date) {
  const date = new Date(dateString);

  if (period === "all") return true;

  if (period === "today") {
    return date.toDateString() === now.toDateString();
  }

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (period === "7days" ? 6 : 29));

  return date >= start && date <= now;
}

function tasksCollection(uid: string) {
  return collection(db, "users", uid, "tasks");
}

function categoriesCollection(uid: string) {
  return collection(db, "users", uid, "categories");
}

function taskDocument(uid: string, id: number) {
  return doc(db, "users", uid, "tasks", String(id));
}

function categoryDocument(uid: string, id: string) {
  return doc(db, "users", uid, "categories", id);
}

function categoryInfo(name: string, categories: Category[]) {
  return categories.find((category) => category.name === name) ??
    DEFAULT_CATEGORIES[5];
}

function cleanCategoryColor(value: unknown) {
  return COLOR_OPTIONS.some((option) => option.value === value)
    ? String(value)
    : "bg-slate-400";
}

export default function GweroTimeTrackApp() {
  const pathname = usePathname();

  const section: Section =
    pathname === "/tasks"
      ? "tasks"
      : pathname === "/reports"
        ? "reports"
        : "dashboard";

  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [currentDate, setCurrentDate] = useState<Date | null>(null);

  const [taskView, setTaskView] = useState<"active" | "done">("active");
  const [period, setPeriod] = useState<Period>("7days");
  const [taskInput, setTaskInput] = useState("");
  const [newCategory, setNewCategory] = useState("Trabalho");

  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState("");

  const [categoryName, setCategoryName] = useState("");
  const [categoryIcon, setCategoryIcon] = useState("📌");
  const [categoryColor, setCategoryColor] = useState("bg-cyan-400");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);

  const startAt = useRef(0);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function navigate(next: Section) {
    const paths: Record<Section, string> = {
      dashboard: "/dashboard",
      tasks: "/tasks",
      reports: "/reports",
    };

    // Native History API keeps the shared application mounted.
    window.history.pushState(null, "", paths[next]);
  }

  function showNotice(message: string) {
    setNotice(message);

    if (noticeTimer.current) clearTimeout(noticeTimer.current);

    noticeTimer.current = setTimeout(() => setNotice(""), 4500);
  }

  // Load tasks and personal categories from Firestore.
  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      const user = auth.currentUser;

      if (!user) {
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        const taskSnapshot = await getDocs(tasksCollection(user.uid));
        let loadedTasks: Task[] = taskSnapshot.docs.map(
          (item) => item.data() as Task
        );

        // Import old local tasks once, preserving the browser copy.
        if (taskSnapshot.empty) {
          const migrationKey = `gwerotimetrack-migrated-${user.uid}`;
          const alreadyMigrated =
            localStorage.getItem(migrationKey) === "true";

          if (!alreadyMigrated) {
            const saved = localStorage.getItem("gwerotimetrack-tasks-v1");

            if (saved) {
              try {
                const parsed: unknown = JSON.parse(saved);

                if (
                  Array.isArray(parsed) &&
                  parsed.every(
                    (item) =>
                      item &&
                      typeof item.id === "number" &&
                      typeof item.title === "string" &&
                      typeof item.category === "string" &&
                      typeof item.done === "boolean" &&
                      Array.isArray(item.entries)
                  )
                ) {
                  loadedTasks = parsed as Task[];

                  for (const task of loadedTasks) {
                    await setDoc(taskDocument(user.uid, task.id), task);
                  }
                }
              } catch (error) {
                console.error("Não foi possível migrar tarefas antigas:", error);
              }
            }

            localStorage.setItem(migrationKey, "true");
          }
        }

        const categorySnapshot = await getDocs(
          categoriesCollection(user.uid)
        );

        let loadedCategories: Category[] = categorySnapshot.docs.map(
          (item) => {
            const data = item.data();

            return {
              id: item.id,
              name: typeof data.name === "string" ? data.name : "Categoria",
              icon: typeof data.icon === "string" ? data.icon : "📌",
              color: cleanCategoryColor(data.color),
            };
          }
        );

        if (categorySnapshot.empty) {
          loadedCategories = [...DEFAULT_CATEGORIES];
        }

        // Preserve any category names in existing tasks that are not yet
        // represented in the personal category collection.
        const usedNames = new Set<string>();

        for (const task of loadedTasks) {
          usedNames.add(task.category);

          for (const entry of task.entries) {
            usedNames.add(entry.category);
          }
        }

        const knownNames = new Set(
          loadedCategories.map((category) => category.name.toLocaleLowerCase())
        );

        const legacyCategories: Category[] = [];

        for (const name of usedNames) {
          if (!name || knownNames.has(name.toLocaleLowerCase())) continue;

          const reference = doc(categoriesCollection(user.uid));

          legacyCategories.push({
            id: reference.id,
            name,
            icon: "📌",
            color: "bg-slate-400",
          });

          knownNames.add(name.toLocaleLowerCase());
        }

        loadedCategories = [...loadedCategories, ...legacyCategories];

        if (categorySnapshot.empty || legacyCategories.length > 0) {
          await Promise.all(
            loadedCategories.map((category) =>
              setDoc(
                categoryDocument(user.uid, category.id),
                category
              )
            )
          );
        }

        if (!cancelled) {
          setTasks(loadedTasks);
          setCategories(loadedCategories);
          setNewCategory(
            loadedCategories[0]?.name ?? "Trabalho"
          );
        }
      } catch (error) {
        console.error("Erro ao carregar dados do Firestore:", error);

        if (!cancelled) {
          showNotice(
            "Não foi possível carregar tarefas ou categorias. Verifica as regras do Firestore."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setCurrentDate(new Date());
  }, []);

  useEffect(() => {
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!running) return;

    const interval = window.setInterval(() => {
      setElapsedMs(Date.now() - startAt.current);
    }, 10);

    return () => window.clearInterval(interval);
  }, [running]);

  const activeTasks = tasks.filter((task) => !task.done);
  const completedTasks = tasks.filter((task) => task.done);

  const selectedTask =
    tasks.find((task) => task.id === selectedTaskId && !task.done) ?? null;

  const allEntries = tasks.flatMap((task) =>
    task.entries.map((entry) => ({
      ...entry,
      taskId: task.id,
      taskTitle: task.title,
      taskDone: task.done,
    }))
  );

  const filteredEntries = currentDate
    ? allEntries.filter((entry) =>
        isInPeriod(entry.date, period, currentDate)
      )
    : [];

  const totalRecorded = allEntries.reduce(
    (sum, entry) => sum + entry.durationMs,
    0
  );

  const periodTotal = filteredEntries.reduce(
    (sum, entry) => sum + entry.durationMs,
    0
  );

  const dashboardCategories = categories.map((category) => ({
    ...category,
    total: allEntries
      .filter((entry) => entry.category === category.name)
      .reduce((sum, entry) => sum + entry.durationMs, 0),
  }));

  const reportCategories = categories.map((category) => ({
    ...category,
    total: filteredEntries
      .filter((entry) => entry.category === category.name)
      .reduce((sum, entry) => sum + entry.durationMs, 0),
  }));

  const maxDashboardCategory = Math.max(
    1,
    ...dashboardCategories.map((category) => category.total)
  );

  const maxReportCategory = Math.max(
    1,
    ...reportCategories.map((category) => category.total)
  );

  const taskTotals = tasks
    .map((task) => ({
      ...task,
      reportTime: filteredEntries
        .filter((entry) => entry.taskId === task.id)
        .reduce((sum, entry) => sum + entry.durationMs, 0),
    }))
    .filter((task) => task.reportTime > 0)
    .sort((a, b) => b.reportTime - a.reportTime);

  async function saveTask(task: Task) {
    const user = auth.currentUser;

    if (!user) {
      showNotice("A tua sessão terminou. Inicia sessão novamente.");
      return false;
    }

    setBusy(true);

    try {
      await setDoc(taskDocument(user.uid, task.id), task);
      return true;
    } catch (error) {
      console.error("Erro ao guardar tarefa:", error);
      showNotice("Erro ao guardar a tarefa no Firestore.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const title = taskInput.trim();

    if (!title) {
      showNotice("Introduz o nome da tarefa.");
      return;
    }

    if (!categories.some((category) => category.name === newCategory)) {
      showNotice("Selecciona uma categoria válida.");
      return;
    }

    const task: Task = {
      id: Date.now(),
      title,
      category: newCategory,
      done: false,
      entries: [],
      createdAt: new Date().toISOString(),
    };

    if (!(await saveTask(task))) return;

    setTasks((current) => [...current, task]);
    setSelectedTaskId(task.id);
    setElapsedMs(0);
    setTaskInput("");
    setTaskView("active");
    navigate("tasks");
    showNotice("✅ Tarefa criada e guardada na nuvem.");
  }

  function selectTask(id: number | null) {
    if (running) return;

    const task = tasks.find((item) => item.id === id && !item.done);

    setSelectedTaskId(task?.id ?? null);
    setElapsedMs(0);
    startAt.current = 0;
  }

  function startTimer() {
    if (!selectedTask || running) return;

    startAt.current = Date.now() - elapsedMs;
    setRunning(true);
  }

  function stopTimer() {
    if (!running) return;

    setElapsedMs(Date.now() - startAt.current);
    setRunning(false);
  }

  function resetTimer() {
    if (running) return;

    setElapsedMs(0);
    startAt.current = 0;
  }

  async function registerTime() {
    if (!selectedTask || running || elapsedMs <= 0 || busy) return;

    const entry: TimeEntry = {
      id: Date.now(),
      durationMs: elapsedMs,
      date: new Date().toISOString(),
      category: selectedTask.category,
    };

    const updatedTask: Task = {
      ...selectedTask,
      entries: [...selectedTask.entries, entry],
    };

    if (!(await saveTask(updatedTask))) return;

    setTasks((current) =>
      current.map((task) =>
        task.id === updatedTask.id ? updatedTask : task
      )
    );

    setElapsedMs(0);
    startAt.current = 0;
    showNotice("💾 Tempo registado na nuvem.");
  }

  async function finishTask(task: Task) {
    if (running && selectedTaskId === task.id) {
      showNotice("Pára e regista o cronómetro antes de finalizar.");
      return;
    }

    const updatedTask: Task = {
      ...task,
      done: true,
      completedAt: new Date().toISOString(),
    };

    if (!(await saveTask(updatedTask))) return;

    setTasks((current) =>
      current.map((item) => item.id === task.id ? updatedTask : item)
    );

    if (selectedTaskId === task.id) {
      setSelectedTaskId(null);
      setElapsedMs(0);
    }

    showNotice("🏁 Tarefa finalizada.");
  }

  async function reopenTask(task: Task) {
    const updatedTask: Task = {
      ...task,
      done: false,
      completedAt: undefined,
    };

    if (!(await saveTask(updatedTask))) return;

    setTasks((current) =>
      current.map((item) => item.id === task.id ? updatedTask : item)
    );

    showNotice("↩️ Tarefa reaberta.");
  }

  async function deleteTask(task: Task) {
    if (busy || (running && selectedTaskId === task.id)) {
      showNotice("Pára o cronómetro antes de eliminar esta tarefa.");
      return;
    }

    if (!window.confirm(`Eliminar "${task.title}" e todo o histórico?`)) {
      return;
    }

    const user = auth.currentUser;
    if (!user) return;

    setBusy(true);

    try {
      await deleteDoc(taskDocument(user.uid, task.id));

      setTasks((current) =>
        current.filter((item) => item.id !== task.id)
      );

      if (selectedTaskId === task.id) {
        setSelectedTaskId(null);
        setElapsedMs(0);
      }

      showNotice("Tarefa eliminada.");
    } catch (error) {
      console.error(error);
      showNotice("Não foi possível eliminar a tarefa.");
    } finally {
      setBusy(false);
    }
  }

  function startEditingCategory(category: Category) {
    setEditingCategoryId(category.id);
    setCategoryName(category.name);
    setCategoryIcon(category.icon);
    setCategoryColor(category.color);
  }

  function cancelCategoryEdit() {
    setEditingCategoryId(null);
    setCategoryName("");
    setCategoryIcon("📌");
    setCategoryColor("bg-cyan-400");
  }

  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const user = auth.currentUser;
    const cleanName = categoryName.trim();
    const cleanIcon = categoryIcon.trim() || "📌";

    if (!user) {
      showNotice("Inicia sessão novamente.");
      return;
    }

    if (cleanName.length < 2 || cleanName.length > 40) {
      showNotice("O nome da categoria deve ter entre 2 e 40 caracteres.");
      return;
    }

    if (
      categories.some(
        (category) =>
          category.id !== editingCategoryId &&
          category.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase()
      )
    ) {
      showNotice("Já existe uma categoria com esse nome.");
      return;
    }

    const oldCategory = categories.find(
      (category) => category.id === editingCategoryId
    );

    const categoryRef = oldCategory
      ? categoryDocument(user.uid, oldCategory.id)
      : doc(categoriesCollection(user.uid));

    const updatedCategory: Category = {
      id: categoryRef.id,
      name: cleanName,
      icon: cleanIcon.slice(0, 8),
      color: cleanCategoryColor(categoryColor),
    };

    const updatedTasks =
      oldCategory && oldCategory.name !== cleanName
        ? tasks.map((task) => {
            const updatedEntries = task.entries.map((entry) =>
              entry.category === oldCategory.name
                ? { ...entry, category: cleanName }
                : entry
            );

            const categoryChanged = task.category === oldCategory.name;
            const entryChanged = updatedEntries.some(
              (entry, index) => entry.category !== task.entries[index]?.category
            );

            return categoryChanged || entryChanged
              ? {
                  ...task,
                  category: categoryChanged ? cleanName : task.category,
                  entries: updatedEntries,
                }
              : task;
          })
        : tasks;

    const modifiedTasks = updatedTasks.filter(
      (task, index) => task !== tasks[index]
    );

    if (modifiedTasks.length > 450) {
      showNotice(
        "Há demasiadas tarefas para renomear de uma só vez. Divide a alteração em várias etapas."
      );
      return;
    }

    setBusy(true);

    try {
      const batch = writeBatch(db);
      batch.set(categoryRef, updatedCategory);

      for (const task of modifiedTasks) {
        batch.set(taskDocument(user.uid, task.id), task);
      }

      await batch.commit();

      setCategories((current) =>
        oldCategory
          ? current.map((item) =>
              item.id === oldCategory.id ? updatedCategory : item
            )
          : [...current, updatedCategory]
      );

      if (oldCategory && oldCategory.name !== cleanName) {
        setTasks(updatedTasks);

        if (newCategory === oldCategory.name) {
          setNewCategory(cleanName);
        }
      }

      cancelCategoryEdit();
      showNotice(
        oldCategory
          ? "✅ Categoria actualizada."
          : "✅ Categoria criada."
      );
    } catch (error) {
      console.error("Erro ao guardar categoria:", error);
      showNotice("Não foi possível guardar a categoria no Firestore.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteCategory(category: Category) {
    const user = auth.currentUser;
    if (!user || busy) return;

    if (categories.length <= 1) {
      showNotice("Mantém pelo menos uma categoria.");
      return;
    }

    const replacement = categories.find(
      (item) => item.id !== category.id
    );

    if (!replacement) return;

    const affectedTasks = tasks
      .map((task) => {
        const taskCategoryChanged = task.category === category.name;

        const updatedEntries = task.entries.map((entry) =>
          entry.category === category.name
            ? { ...entry, category: replacement.name }
            : entry
        );

        const entryChanged = updatedEntries.some(
          (entry, index) => entry.category !== task.entries[index]?.category
        );

        if (!taskCategoryChanged && !entryChanged) return null;

        return {
          ...task,
          category: taskCategoryChanged ? replacement.name : task.category,
          entries: updatedEntries,
        };
      })
      .filter((task): task is Task => task !== null);

    if (affectedTasks.length > 450) {
      showNotice(
        "Há demasiadas tarefas para esta operação ser concluída de uma só vez."
      );
      return;
    }

    const confirmed = window.confirm(
      `Eliminar "${category.name}"? As tarefas e sessões associadas serão transferidas para "${replacement.name}".`
    );

    if (!confirmed) return;

    setBusy(true);

    try {
      const batch = writeBatch(db);
      batch.delete(categoryDocument(user.uid, category.id));

      for (const task of affectedTasks) {
        batch.set(taskDocument(user.uid, task.id), task);
      }

      await batch.commit();

      setCategories((current) =>
        current.filter((item) => item.id !== category.id)
      );
      setTasks((current) =>
        current.map((task) =>
          affectedTasks.find((updated) => updated.id === task.id) ?? task
        )
      );

      if (newCategory === category.name) {
        setNewCategory(replacement.name);
      }

      if (editingCategoryId === category.id) cancelCategoryEdit();

      showNotice(
        `Categoria eliminada. Os registos associados foram transferidos para "${replacement.name}".`
      );
    } catch (error) {
      console.error("Erro ao eliminar categoria:", error);
      showNotice("Não foi possível eliminar a categoria.");
    } finally {
      setBusy(false);
    }
  }

  function exportReport() {
    const rows = [
      ["Data", "Tarefa", "Categoria", "Duracao", "Estado"],
      ...filteredEntries.map((entry) => [
        formatDate(entry.date, true),
        entry.taskTitle,
        entry.category,
        formatTime(entry.durationMs, true),
        entry.taskDone ? "Finalizada" : "Activa",
      ]),
    ];

    const csv =
      "\uFEFF" +
      rows
        .map((row) =>
          row
            .map((value) => `"${String(value).replace(/"/g, '""')}"`)
            .join(";")
        )
        .join("\r\n");

    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" })
    );

    const link = document.createElement("a");
    link.href = url;
    link.download = "gwerotimetrack-relatorio.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function logout() {
    if (
      running &&
      !window.confirm(
        "Tens um cronómetro activo que ainda não foi registado. Queres terminar a sessão?"
      )
    ) {
      return;
    }

    await signOut(auth);
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/95 px-5 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <button onClick={() => navigate("dashboard")} className="text-left">
            <h1 className="text-xl font-bold text-cyan-400">⚡ GweroTimeTrack</h1>
            <p className="mt-1 text-xs text-slate-400">O teu tempo. Os teus objectivos.</p>
          </button>

          <div className="flex items-center gap-3">
            <span className="hidden max-w-[220px] truncate text-xs text-slate-400 sm:block">
              👤 {auth.currentUser?.displayName || auth.currentUser?.email}
            </span>
            <button
              onClick={logout}
              className="rounded-lg border border-slate-700 px-3 py-2 text-xs hover:bg-slate-900"
            >
              Terminar sessão
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-7 px-5 py-7 sm:px-6 sm:py-9">
        <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-medium text-cyan-400">
              {currentDate
                ? currentDate.toLocaleDateString("pt-PT", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : "A carregar data..."}
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">
              Olá{auth.currentUser?.displayName
                ? `, ${auth.currentUser.displayName.split(" ")[0]}`
                : ""}! 👋
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Gere as tuas actividades e acompanha cada minuto.
            </p>
          </div>

          <button
            onClick={() => navigate("tasks")}
            className="rounded-xl bg-cyan-500 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-cyan-400"
          >
            ➕ Nova tarefa
          </button>
        </section>

        <nav className="flex gap-2 overflow-x-auto border-b border-slate-800 pb-3">
          {[
            { id: "dashboard", label: "🏠 Visão geral" },
            { id: "tasks", label: "📋 Tarefas" },
            { id: "reports", label: "📊 Relatórios" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(item.id as Section)}
              className={`whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-semibold ${
                section === item.id
                  ? "bg-cyan-500 text-slate-950"
                  : "text-slate-400 hover:bg-slate-900 hover:text-white"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {notice && (
          <div role="status" className="rounded-xl border border-cyan-900 bg-cyan-950/50 px-4 py-3 text-sm text-cyan-200">
            {notice}
          </div>
        )}

        {loading ? (
          <p className="rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center text-slate-400">
            A carregar tarefas e categorias da nuvem... ⏳
          </p>
        ) : (
          <>
            {section !== "reports" && (
              <>
                <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <StatCard icon="📋" label="Total de tarefas" value={String(tasks.length)} />
                  <StatCard icon="🔵" label="Tarefas activas" value={String(activeTasks.length)} />
                  <StatCard icon="✅" label="Tarefas finalizadas" value={String(completedTasks.length)} />
                  <StatCard icon="⏱️" label="Tempo acumulado" value={formatTime(totalRecorded)} highlight />
                </section>

                <section className="rounded-2xl border border-cyan-900/70 bg-slate-900 p-5 sm:p-6">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                    <div>
                      <h3 className="text-lg font-bold">⏱️ Registar tempo</h3>
                      <p className="mt-1 text-sm text-slate-400">
                        Selecciona uma tarefa e inicia a sessão.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <label htmlFor="timer-task" className="shrink-0 text-xs text-slate-400">
                        🎯 Tarefa:
                      </label>
                      <select
                        id="timer-task"
                        value={selectedTaskId ?? ""}
                        disabled={running}
                        onChange={(event) =>
                          selectTask(event.target.value ? Number(event.target.value) : null)
                        }
                        className="w-full max-w-[240px] rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm disabled:opacity-60"
                      >
                        <option value="">Seleccionar...</option>
                        {activeTasks.map((task) => (
                          <option key={task.id} value={task.id}>{task.title}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950 p-5 sm:p-7">
                    <p className="text-center text-sm text-slate-400">
                      {selectedTask
                        ? `${categoryInfo(selectedTask.category, categories).icon} ${selectedTask.title}`
                        : "Selecciona uma tarefa para começar"}
                    </p>
                    <div className="my-5 text-center">
                      <p className="font-mono text-4xl font-bold tracking-tight sm:text-6xl">
                        {formatTime(elapsedMs, true)}
                      </p>
                      <p className="mt-2 text-xs text-slate-500">HH : MM : SS . milésimos</p>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2">
                      <button onClick={startTimer} disabled={!selectedTask || running} className="rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-40">▶️ Iniciar</button>
                      <button onClick={stopTimer} disabled={!running} className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm disabled:opacity-40">⏸️ Parar</button>
                      <button onClick={resetTimer} disabled={running || elapsedMs === 0} className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm disabled:opacity-40">🔄 Reiniciar</button>
                      <button onClick={registerTime} disabled={!selectedTask || running || elapsedMs === 0 || busy} className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-40">💾 Registar tempo</button>
                    </div>
                    <div className="mt-4 flex flex-col items-center gap-1 text-xs text-slate-500 sm:flex-row sm:justify-between">
                      <span>{running ? "🟢 Sessão em curso" : elapsedMs > 0 ? "🟡 Sessão parada, pronta para registo" : "⚪ Cronómetro parado"}</span>
                      {selectedTask && <span className="text-cyan-400">Total nesta tarefa: {formatTime(taskTime(selectedTask))}</span>}
                    </div>
                  </div>
                </section>
              </>
            )}

            {section === "dashboard" && (
              <section className="grid gap-5 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
                  <h3 className="font-bold">📊 Tempo por categoria</h3>
                  <p className="mt-1 text-xs text-slate-400">Distribuição de todo o tempo registado.</p>
                  <div className="mt-5 space-y-4">
                    {dashboardCategories.map((category) => (
                      <div key={category.id}>
                        <div className="mb-1.5 flex justify-between gap-3 text-sm">
                          <span>{category.icon} {category.name}</span>
                          <span className="font-mono text-xs text-slate-400">{formatTime(category.total)}</span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
                          <div className={`h-full rounded-full ${category.color}`} style={{ width: `${(category.total / maxDashboardCategory) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  {totalRecorded === 0 && <p className="mt-4 text-xs text-slate-500">Regista uma sessão para começar a ver o gráfico.</p>}
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
                  <h3 className="font-bold">📝 Tarefas recentes</h3>
                  <div className="mt-4 space-y-3">
                    {[...tasks].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5).map((task) => (
                      <div key={task.id} className="flex items-center gap-3 rounded-xl bg-slate-950 p-3">
                        <span className="text-xl">{categoryInfo(task.category, categories).icon}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{task.title}</p>
                          <p className="mt-1 text-xs text-slate-500">{task.category}</p>
                        </div>
                        <span className="whitespace-nowrap text-xs text-cyan-400">{formatTime(taskTime(task))}</span>
                      </div>
                    ))}
                    {tasks.length === 0 && <p className="py-8 text-center text-sm text-slate-500">🌱 Cria a tua primeira tarefa.</p>}
                  </div>
                </div>
              </section>
            )}

            {section === "tasks" && (
              <section className="space-y-5">
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
                  <h3 className="text-lg font-bold">📋 Gestão de tarefas</h3>
                  <p className="mt-1 text-sm text-slate-400">Cada tarefa e o seu histórico são guardados na nuvem.</p>

                  <form onSubmit={createTask} className="mt-5 grid gap-3 md:grid-cols-[1fr_190px_auto]">
                    <input
                      value={taskInput}
                      onChange={(event) => setTaskInput(event.target.value)}
                      placeholder="Ex.: Estudar CCNA..."
                      className="min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm"
                    />
                    <select value={newCategory} onChange={(event) => setNewCategory(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm">
                      {categories.map((category) => <option key={category.id} value={category.name}>{category.icon} {category.name}</option>)}
                    </select>
                    <button type="submit" disabled={busy} className="rounded-lg bg-cyan-500 px-5 py-3 text-sm font-bold text-slate-950 disabled:opacity-40">➕ Criar tarefa</button>
                  </form>
                </div>

                <details className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
                  <summary className="cursor-pointer text-lg font-bold">🏷️ Gerir categorias</summary>
                  <p className="mt-2 text-sm text-slate-400">
                    Cria, renomeia e personaliza as tuas categorias. Se eliminares uma categoria utilizada, os registos serão transferidos para outra categoria.
                  </p>

                  
                  <form onSubmit={saveCategory} className="mt-5 space-y-5">
                    <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
                      <div>
                        <label
                          htmlFor="category-name"
                          className="mb-2 block text-sm font-medium text-slate-300"
                        >
                          Nome da categoria
                        </label>
                        <input
                          id="category-name"
                          value={categoryName}
                          onChange={(event) => setCategoryName(event.target.value)}
                          required
                          minLength={2}
                          maxLength={40}
                          placeholder="Ex.: Cibersegurança"
                          className="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="category-color"
                          className="mb-2 block text-sm font-medium text-slate-300"
                        >
                          Cor da categoria
                        </label>
                        <select
                          id="category-color"
                          value={categoryColor}
                          onChange={(event) => setCategoryColor(event.target.value)}
                          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none transition focus:border-cyan-400"
                        >
                          {COLOR_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 sm:p-5">
                      <CategoryIconPicker
                        value={categoryIcon}
                        onChange={setCategoryIcon}
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-800 pt-4">
                      {editingCategoryId && (
                        <button
                          type="button"
                          onClick={cancelCategoryEdit}
                          className="rounded-xl border border-slate-700 px-4 py-3 text-sm text-slate-300 transition hover:bg-slate-800"
                        >
                          Cancelar
                        </button>
                      )}

                      <button
                        type="submit"
                        disabled={busy}
                        className="rounded-xl bg-cyan-500 px-6 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {busy
                          ? "A guardar..."
                          : editingCategoryId
                            ? "💾 Guardar alterações"
                            : "➕ Criar categoria"}
                      </button>
                    </div>
                  </form>


                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {categories.map((category) => {
                      const assignedTasks = tasks.filter(
                        (task) =>
                          task.category === category.name ||
                          task.entries.some((entry) => entry.category === category.name)
                      ).length;

                      return (
                        <div key={category.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                          <div className="flex items-center gap-3">
                            <span className={`h-3 w-3 shrink-0 rounded-full ${category.color}`} />
                            <span className="text-2xl">{category.icon}</span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold">{category.name}</p>
                              <p className="text-xs text-slate-500">{assignedTasks} tarefa(s)/registos associados</p>
                            </div>
                          </div>
                          <div className="mt-3 flex gap-2">
                            <button type="button" onClick={() => startEditingCategory(category)} className="flex-1 rounded-lg border border-slate-700 px-3 py-2 text-xs hover:border-cyan-500">✏️ Editar</button>
                            <button type="button" onClick={() => deleteCategory(category)} disabled={busy || categories.length <= 1} className="rounded-lg border border-rose-900 px-3 py-2 text-xs text-rose-300 hover:bg-rose-950 disabled:opacity-40">🗑️</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </details>

                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
                  <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-4">
                    <button onClick={() => setTaskView("active")} className={`rounded-lg px-4 py-2 text-sm font-semibold ${taskView === "active" ? "bg-cyan-500 text-slate-950" : "border border-slate-700 text-slate-400"}`}>🔵 Activas ({activeTasks.length})</button>
                    <button onClick={() => setTaskView("done")} className={`rounded-lg px-4 py-2 text-sm font-semibold ${taskView === "done" ? "bg-emerald-500 text-slate-950" : "border border-slate-700 text-slate-400"}`}>✅ Finalizadas ({completedTasks.length})</button>
                  </div>

                  <div className="mt-4 space-y-3">
                    {(taskView === "active" ? activeTasks : completedTasks).map((task) => (
                      <article key={task.id} className={`rounded-xl border p-4 ${selectedTaskId === task.id ? "border-cyan-500/70 bg-cyan-950/20" : "border-slate-800 bg-slate-950"}`}>
                        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className={`break-words font-semibold ${task.done ? "text-slate-400 line-through" : ""}`}>{task.title}</h4>
                              <span className="rounded-full border border-slate-700 px-2 py-1 text-xs">{categoryInfo(task.category, categories).icon} {task.category}</span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                              <span>⏱️ {formatTime(taskTime(task))}</span>
                              <span>🧾 {task.entries.length} sessões</span>
                              <span>📅 {formatDate(task.createdAt)}</span>
                            </div>
                            {task.completedAt && <p className="mt-1 text-xs text-emerald-400">🏁 Finalizada em {formatDate(task.completedAt)}</p>}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {!task.done && (
                              <>
                                <button onClick={() => selectTask(task.id)} disabled={running} className={`rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40 ${selectedTaskId === task.id ? "bg-cyan-500 text-slate-950" : "border border-slate-700 hover:bg-slate-800"}`}>{selectedTaskId === task.id ? "✓ Seleccionada" : "🎯 Seleccionar"}</button>
                                <button onClick={() => finishTask(task)} disabled={busy || (running && selectedTaskId === task.id)} className="rounded-lg border border-emerald-900 px-3 py-2 text-xs text-emerald-400 hover:bg-emerald-950 disabled:opacity-40">🏁 Finalizar</button>
                              </>
                            )}
                            {task.done && <button onClick={() => reopenTask(task)} disabled={busy} className="rounded-lg border border-cyan-900 px-3 py-2 text-xs text-cyan-400 hover:bg-cyan-950 disabled:opacity-40">↩️ Reabrir</button>}
                            <button onClick={() => deleteTask(task)} disabled={busy || (running && selectedTaskId === task.id)} className="rounded-lg px-3 py-2 text-xs text-rose-400 hover:bg-rose-950 disabled:opacity-40">🗑️</button>
                          </div>
                        </div>

                        {task.entries.length > 0 && (
                          <details className="mt-4 border-t border-slate-800 pt-3">
                            <summary className="cursor-pointer text-xs font-semibold text-cyan-400">📚 Histórico de tempo ({task.entries.length})</summary>
                            <div className="mt-3 space-y-2">
                              {[...task.entries].reverse().map((entry) => (
                                <div key={entry.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-slate-900 p-3 text-xs">
                                  <span className="text-slate-400">{formatDate(entry.date, true)}</span>
                                  <span>{categoryInfo(entry.category, categories).icon} {entry.category}</span>
                                  <span className="font-mono text-emerald-400">+{formatTime(entry.durationMs, true)}</span>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                      </article>
                    ))}

                    {(taskView === "active" ? activeTasks : completedTasks).length === 0 && (
                      <p className="py-10 text-center text-sm text-slate-500">
                        {taskView === "active" ? "🌱 Não tens tarefas activas." : "🏁 Ainda não finalizaste tarefas."}
                      </p>
                    )}
                  </div>
                </div>
              </section>
            )}

            {section === "reports" && (
              <section className="space-y-5">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                  <div>
                    <h3 className="text-2xl font-bold">📊 Relatórios</h3>
                    <p className="mt-1 text-sm text-slate-400">Analisa como distribuis o teu tempo.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select value={period} onChange={(event) => setPeriod(event.target.value as Period)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm">
                      <option value="today">Hoje</option>
                      <option value="7days">Últimos 7 dias</option>
                      <option value="30days">Últimos 30 dias</option>
                      <option value="all">Todo o período</option>
                    </select>
                    <button onClick={exportReport} className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400">📥 Exportar CSV</button>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <StatCard icon="⏱️" label="Tempo no período" value={formatTime(periodTotal)} highlight />
                  <StatCard icon="🧾" label="Sessões registadas" value={String(filteredEntries.length)} />
                  <StatCard icon="📋" label="Total de tarefas" value={String(tasks.length)} />
                  <StatCard icon="🏁" label="Tarefas finalizadas" value={String(completedTasks.length)} />
                </div>

                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
                    <h4 className="font-bold">🏷️ Tempo por categoria</h4>
                    <div className="mt-5 space-y-4">
                      {reportCategories.map((category) => (
                        <div key={category.id}>
                          <div className="mb-1.5 flex justify-between gap-3 text-sm">
                            <span>{category.icon} {category.name}</span>
                            <span className="font-mono text-slate-400">{formatTime(category.total)}</span>
                          </div>
                          <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
                            <div className={`h-full rounded-full ${category.color}`} style={{ width: `${(category.total / maxReportCategory) * 100}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
                    <h4 className="font-bold">🎯 Tarefas com mais tempo</h4>
                    <div className="mt-4 space-y-3">
                      {taskTotals.slice(0, 8).map((task) => (
                        <div key={task.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-950 p-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{task.title}</p>
                            <p className="mt-1 text-xs text-slate-500">{categoryInfo(task.category, categories).icon} {task.category}</p>
                          </div>
                          <span className="whitespace-nowrap font-mono text-xs text-cyan-400">{formatTime(task.reportTime)}</span>
                        </div>
                      ))}
                      {taskTotals.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Ainda não existem sessões neste período.</p>}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
                  <h4 className="font-bold">🧾 Histórico de actividades</h4>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[650px] text-left text-sm">
                      <thead className="border-b border-slate-800 text-xs text-slate-500">
                        <tr>
                          <th className="px-3 py-3">Data</th>
                          <th className="px-3 py-3">Tarefa</th>
                          <th className="px-3 py-3">Categoria</th>
                          <th className="px-3 py-3">Duração</th>
                          <th className="px-3 py-3">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...filteredEntries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((entry) => (
                          <tr key={entry.id} className="border-b border-slate-800/70">
                            <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-400">{formatDate(entry.date, true)}</td>
                            <td className="px-3 py-3">{entry.taskTitle}</td>
                            <td className="px-3 py-3">{categoryInfo(entry.category, categories).icon} {entry.category}</td>
                            <td className="whitespace-nowrap px-3 py-3 font-mono text-cyan-400">{formatTime(entry.durationMs, true)}</td>
                            <td className="px-3 py-3 text-xs">{entry.taskDone ? "✅ Finalizada" : "🔵 Activa"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {filteredEntries.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Não existem registos neste período.</p>}
                </div>
              </section>
            )}
          </>
        )}

        <footer className="pb-4 pt-2 text-center text-xs text-slate-600">
          ⚡ GweroTimeTrack · Cada sessão conta.
        </footer>
      </div>
    </main>
  );
}

function StatCard({
  icon,
  label,
  value,
  highlight = false,
}: {
  icon: string;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 transition hover:border-slate-700">
      <p className="text-sm text-slate-400">
        <span className="mr-2">{icon}</span>{label}
      </p>
      <p className={`mt-3 break-words text-2xl font-bold tracking-tight ${highlight ? "text-cyan-400" : "text-slate-100"}`}>
        {value}
      </p>
    </div>
  );
}
