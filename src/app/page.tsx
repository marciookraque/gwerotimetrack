
"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

const CATEGORIES = [
  { name: "Trabalho", icon: "💼", color: "bg-cyan-400" },
  { name: "Estudos", icon: "📚", color: "bg-violet-400" },
  { name: "Projectos", icon: "🚀", color: "bg-amber-400" },
  { name: "Reuniões", icon: "🤝", color: "bg-emerald-400" },
  { name: "Pessoal", icon: "🌱", color: "bg-pink-400" },
  { name: "Outros", icon: "📌", color: "bg-slate-400" },
];

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

function formatTime(ms: number, showMs = false) {
  const safe = Math.max(0, Math.floor(ms));
  const seconds = Math.floor(safe / 1000);

  const value = [
    String(Math.floor(seconds / 3600)).padStart(2, "0"),
    String(Math.floor((seconds % 3600) / 60)).padStart(2, "0"),
    String(seconds % 60).padStart(2, "0"),
  ].join(":");

  return showMs
    ? `${value}.${String(safe % 1000).padStart(3, "0")}`
    : value;
}

function taskTime(task: Task) {
  return task.entries.reduce((sum, entry) => sum + entry.durationMs, 0);
}

function categoryInfo(name: string) {
  return CATEGORIES.find((category) => category.name === name) ?? CATEGORIES[5];
}

function isInPeriod(dateString: string, period: Period, now: Date) {
  const date = new Date(dateString);

  if (period === "all") return true;

  if (period === "today") {
    return date.toDateString() === now.toDateString();
  }

  const start = new Date(now.getTime());
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (period === "7days" ? 6 : 29));

  return date >= start && date <= now;
}

function formatDate(dateString: string, includeTime = false) {
  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) return "Data indisponível";

  return date.toLocaleString(
    "pt-PT",
    includeTime
      ? { dateStyle: "short", timeStyle: "short" }
      : { dateStyle: "short" }
  );
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [currentDate, setCurrentDate] = useState<Date | null>(null);

  const [section, setSection] = useState<Section>("dashboard");
  const [taskView, setTaskView] = useState<"active" | "done">("active");
  const [period, setPeriod] = useState<Period>("7days");

  const [taskInput, setTaskInput] = useState("");
  const [newCategory, setNewCategory] = useState("Trabalho");
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);

  const [elapsedMs, setElapsedMs] = useState(0);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState("");

  const startAt = useRef(0);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read saved tasks after the component mounts in the browser.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("gwerotimetrack-tasks-v1");

      if (saved) {
        const parsed: unknown = JSON.parse(saved);

        if (Array.isArray(parsed)) {
          setTasks(parsed as Task[]);
        }
      }
    } catch {
      setNotice("Não foi possível carregar os dados guardados.");
    } finally {
      setLoaded(true);
    }
  }, []);

  // Read the current date in the browser, not during server prerendering.
  useEffect(() => {
    setCurrentDate(new Date());
  }, []);

  // Persist tasks locally whenever they change.
  useEffect(() => {
    if (!loaded) return;

    try {
      localStorage.setItem("gwerotimetrack-tasks-v1", JSON.stringify(tasks));
    } catch {
      setNotice("Não foi possível guardar os dados neste navegador.");
    }
  }, [tasks, loaded]);

  // Update the timer display using elapsed wall-clock time.
  useEffect(() => {
    if (!running) return;

    const interval = window.setInterval(() => {
      setElapsedMs(Date.now() - startAt.current);
    }, 10);

    return () => window.clearInterval(interval);
  }, [running]);

  // Clean up a pending notification timer.
  useEffect(() => {
    return () => {
      if (noticeTimer.current) {
        clearTimeout(noticeTimer.current);
      }
    };
  }, []);

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

  // Dashboard chart uses all recorded sessions.
  const dashboardCategoryTotals = CATEGORIES.map((category) => ({
    ...category,
    total: allEntries
      .filter((entry) => entry.category === category.name)
      .reduce((sum, entry) => sum + entry.durationMs, 0),
  }));

  // Report chart respects the selected reporting period.
  const reportCategoryTotals = CATEGORIES.map((category) => ({
    ...category,
    total: filteredEntries
      .filter((entry) => entry.category === category.name)
      .reduce((sum, entry) => sum + entry.durationMs, 0),
  }));

  const maxDashboardCategory = Math.max(
    1,
    ...dashboardCategoryTotals.map((item) => item.total)
  );

  const maxReportCategory = Math.max(
    1,
    ...reportCategoryTotals.map((item) => item.total)
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

  function showNotice(message: string) {
    setNotice(message);

    if (noticeTimer.current) {
      clearTimeout(noticeTimer.current);
    }

    noticeTimer.current = setTimeout(() => {
      setNotice("");
    }, 3500);
  }

  function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const title = taskInput.trim();

    if (!title) {
      showNotice("Escreve o nome da tarefa primeiro.");
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

    setTasks((current) => [...current, task]);
    setSelectedTaskId(task.id);
    setElapsedMs(0);
    setTaskInput("");
    setTaskView("active");
    setSection("tasks");

    showNotice("✅ Tarefa criada e seleccionada.");
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

  function registerTime() {
    if (!selectedTask || running || elapsedMs <= 0) return;

    const entry: TimeEntry = {
      id: Date.now(),
      durationMs: elapsedMs,
      date: new Date().toISOString(),
      category: selectedTask.category,
    };

    setTasks((current) =>
      current.map((task) =>
        task.id === selectedTask.id
          ? { ...task, entries: [...task.entries, entry] }
          : task
      )
    );

    setElapsedMs(0);
    startAt.current = 0;

    showNotice("💾 Tempo registado com sucesso.");
  }

  function finishTask(task: Task) {
    if (running && selectedTaskId === task.id) {
      showNotice("Pára e regista o cronómetro antes de finalizar.");
      return;
    }

    setTasks((current) =>
      current.map((item) =>
        item.id === task.id
          ? { ...item, done: true, completedAt: new Date().toISOString() }
          : item
      )
    );

    if (selectedTaskId === task.id) {
      setSelectedTaskId(null);
      setElapsedMs(0);
      startAt.current = 0;
    }

    showNotice("🏁 Tarefa finalizada.");
  }

  function reopenTask(task: Task) {
    setTasks((current) =>
      current.map((item) =>
        item.id === task.id
          ? { ...item, done: false, completedAt: undefined }
          : item
      )
    );

    showNotice("↩️ Tarefa reaberta.");
  }

  function deleteTask(task: Task) {
    if (running && selectedTaskId === task.id) {
      showNotice("Pára o cronómetro antes de eliminar esta tarefa.");
      return;
    }

    if (
      !window.confirm(
        `Eliminar "${task.title}" e todo o seu histórico de tempo?`
      )
    ) {
      return;
    }

    setTasks((current) => current.filter((item) => item.id !== task.id));

    if (selectedTaskId === task.id) {
      setSelectedTaskId(null);
      setElapsedMs(0);
      startAt.current = 0;
    }

    showNotice("Tarefa eliminada.");
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

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/95 px-5 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <button onClick={() => setSection("dashboard")} className="text-left">
            <h1 className="text-xl font-bold tracking-tight text-cyan-400">
              ⚡ GweroTimeTrack
            </h1>
            <p className="mt-1 text-xs text-slate-400">
              O teu tempo. Os teus objectivos.
            </p>
          </button>

          <span className="hidden rounded-full border border-slate-800 px-3 py-2 text-xs text-slate-400 sm:block">
            💾 Guardado neste navegador
          </span>
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
              Olá! Vamos organizar o teu dia? 👋
            </h2>

            <p className="mt-2 text-sm text-slate-400">
              Gere as tuas actividades e acompanha cada minuto.
            </p>
          </div>

          <button
            onClick={() => setSection("tasks")}
            className="rounded-xl bg-cyan-500 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-400"
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
              onClick={() => setSection(item.id as Section)}
              className={`whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
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
          <div
            role="status"
            className="rounded-xl border border-cyan-900 bg-cyan-950/50 px-4 py-3 text-sm text-cyan-200"
          >
            {notice}
          </div>
        )}

        {!loaded ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center text-slate-400">
            A carregar os teus dados... ⏳
          </div>
        ) : (
          <>
            {(section === "dashboard" || section === "tasks") && (
              <>
                <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <StatCard
                    icon="📋"
                    label="Total de tarefas"
                    value={String(tasks.length)}
                  />

                  <StatCard
                    icon="🔵"
                    label="Tarefas activas"
                    value={String(activeTasks.length)}
                  />

                  <StatCard
                    icon="✅"
                    label="Tarefas finalizadas"
                    value={String(completedTasks.length)}
                  />

                  <StatCard
                    icon="⏱️"
                    label="Tempo acumulado"
                    value={formatTime(totalRecorded)}
                    highlight
                  />
                </section>

                <section className="rounded-2xl border border-cyan-900/70 bg-slate-900 p-5 sm:p-6">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                    <div>
                      <h3 className="text-lg font-bold">⏱️ Registar tempo</h3>
                      <p className="mt-1 text-sm text-slate-400">
                        Escolhe uma tarefa e inicia a sessão de trabalho.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 sm:justify-end">
                      <label
                        htmlFor="timer-task"
                        className="shrink-0 text-xs text-slate-400"
                      >
                        🎯 Tarefa:
                      </label>

                      <select
                        id="timer-task"
                        value={selectedTaskId ?? ""}
                        disabled={running}
                        onChange={(event) =>
                          selectTask(
                            event.target.value
                              ? Number(event.target.value)
                              : null
                          )
                        }
                        className="w-full max-w-[240px] rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-400 disabled:opacity-60"
                      >
                        <option value="">Seleccionar...</option>
                        {activeTasks.map((task) => (
                          <option key={task.id} value={task.id}>
                            {task.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950 p-5 sm:p-7">
                    <p className="text-center text-sm text-slate-400">
                      {selectedTask
                        ? `${categoryInfo(selectedTask.category).icon} ${selectedTask.title}`
                        : "Selecciona uma tarefa para começar"}
                    </p>

                    <div className="my-5 text-center">
                      <p className="font-mono text-4xl font-bold tracking-tight text-white sm:text-6xl">
                        {formatTime(elapsedMs, true)}
                      </p>
                      <p className="mt-2 text-xs text-slate-500">
                        HH : MM : SS . milésimos
                      </p>
                    </div>

                    <div className="flex flex-wrap justify-center gap-2">
                      <button
                        onClick={startTimer}
                        disabled={!selectedTask || running}
                        className="rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        ▶️ Iniciar
                      </button>

                      <button
                        onClick={stopTimer}
                        disabled={!running}
                        className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm hover:bg-slate-800 disabled:opacity-40"
                      >
                        ⏸️ Parar
                      </button>

                      <button
                        onClick={resetTimer}
                        disabled={running || elapsedMs === 0}
                        className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm hover:bg-slate-800 disabled:opacity-40"
                      >
                        🔄 Reiniciar
                      </button>

                      <button
                        onClick={registerTime}
                        disabled={!selectedTask || running || elapsedMs === 0}
                        className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        💾 Registar tempo
                      </button>
                    </div>

                    <div className="mt-4 flex flex-col items-center gap-1 text-xs text-slate-500 sm:flex-row sm:justify-between">
                      <span>
                        {running
                          ? "🟢 Sessão em curso"
                          : elapsedMs > 0
                            ? "🟡 Sessão parada, pronta para registo"
                            : "⚪ Cronómetro parado"}
                      </span>

                      {selectedTask && (
                        <span className="text-cyan-400">
                          Total nesta tarefa: {formatTime(taskTime(selectedTask))}
                        </span>
                      )}
                    </div>
                  </div>
                </section>

                {section === "dashboard" && (
                  <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
                    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-bold">📊 Tempo por categoria</h3>
                          <p className="mt-1 text-xs text-slate-400">
                            Distribuição de todo o tempo registado.
                          </p>
                        </div>

                        <button
                          onClick={() => setSection("reports")}
                          className="text-xs font-semibold text-cyan-400 hover:text-cyan-300"
                        >
                          Detalhes →
                        </button>
                      </div>

                      <div className="mt-5 space-y-4">
                        {dashboardCategoryTotals.map((category) => (
                          <div key={category.name}>
                            <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                              <span className="text-slate-300">
                                {category.icon} {category.name}
                              </span>
                              <span className="font-mono text-xs text-slate-400">
                                {formatTime(category.total)}
                              </span>
                            </div>

                            <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
                              <div
                                className={`h-full rounded-full ${category.color} transition-all duration-500`}
                                style={{
                                  width: `${
                                    (category.total / maxDashboardCategory) * 100
                                  }%`,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>

                      {totalRecorded === 0 && (
                        <p className="mt-4 text-xs text-slate-500">
                          Regista uma sessão para começar a ver o gráfico.
                        </p>
                      )}
                    </div>

                    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-bold">📝 Tarefas recentes</h3>
                          <p className="mt-1 text-xs text-slate-400">
                            As últimas actividades criadas.
                          </p>
                        </div>

                        <button
                          onClick={() => setSection("tasks")}
                          className="text-xs font-semibold text-cyan-400 hover:text-cyan-300"
                        >
                          Ver todas →
                        </button>
                      </div>

                      <div className="mt-4 space-y-3">
                        {[...tasks]
                          .sort(
                            (a, b) =>
                              new Date(b.createdAt).getTime() -
                              new Date(a.createdAt).getTime()
                          )
                          .slice(0, 5)
                          .map((task) => (
                            <div
                              key={task.id}
                              className="flex items-center gap-3 rounded-xl bg-slate-950 p-3"
                            >
                              <span className="text-xl">
                                {categoryInfo(task.category).icon}
                              </span>

                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold">
                                  {task.title}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {task.category}
                                </p>
                              </div>

                              <span className="whitespace-nowrap text-xs text-cyan-400">
                                {formatTime(taskTime(task))}
                              </span>
                            </div>
                          ))}

                        {tasks.length === 0 && (
                          <p className="py-8 text-center text-sm text-slate-500">
                            🌱 Cria a tua primeira tarefa.
                          </p>
                        )}
                      </div>
                    </div>
                  </section>
                )}

                {section === "tasks" && (
                  <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
                    <div>
                      <h3 className="text-lg font-bold">📋 Gestão de tarefas</h3>
                      <p className="mt-1 text-sm text-slate-400">
                        Organiza actividades por categoria e acompanha o tempo.
                      </p>
                    </div>

                    <form
                      onSubmit={createTask}
                      className="mt-5 grid gap-3 md:grid-cols-[1fr_190px_auto]"
                    >
                      <input
                        value={taskInput}
                        onChange={(event) => setTaskInput(event.target.value)}
                        placeholder="Ex.: Estudar CCNA..."
                        className="min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-cyan-400"
                      />

                      <select
                        value={newCategory}
                        onChange={(event) => setNewCategory(event.target.value)}
                        className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm outline-none focus:border-cyan-400"
                      >
                        {CATEGORIES.map((category) => (
                          <option key={category.name} value={category.name}>
                            {category.icon} {category.name}
                          </option>
                        ))}
                      </select>

                      <button
                        type="submit"
                        className="rounded-lg bg-cyan-500 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-cyan-400"
                      >
                        ➕ Criar tarefa
                      </button>
                    </form>

                    <div className="mt-6 flex flex-wrap gap-2 border-b border-slate-800 pb-4">
                      <button
                        onClick={() => setTaskView("active")}
                        className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                          taskView === "active"
                            ? "bg-cyan-500 text-slate-950"
                            : "border border-slate-700 text-slate-400"
                        }`}
                      >
                        🔵 Activas ({activeTasks.length})
                      </button>

                      <button
                        onClick={() => setTaskView("done")}
                        className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                          taskView === "done"
                            ? "bg-emerald-500 text-slate-950"
                            : "border border-slate-700 text-slate-400"
                        }`}
                      >
                        ✅ Finalizadas ({completedTasks.length})
                      </button>
                    </div>

                    <div className="mt-4 space-y-3">
                      {(taskView === "active" ? activeTasks : completedTasks).map(
                        (task) => (
                          <article
                            key={task.id}
                            className={`rounded-xl border p-4 ${
                              selectedTaskId === task.id
                                ? "border-cyan-500/70 bg-cyan-950/20"
                                : "border-slate-800 bg-slate-950"
                            }`}
                          >
                            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h4
                                    className={`break-words font-semibold ${
                                      task.done ? "text-slate-400 line-through" : ""
                                    }`}
                                  >
                                    {task.title}
                                  </h4>

                                  <span className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300">
                                    {categoryInfo(task.category).icon} {task.category}
                                  </span>
                                </div>

                                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                                  <span>⏱️ {formatTime(taskTime(task))}</span>
                                  <span>🧾 {task.entries.length} sessões</span>
                                  <span>📅 {formatDate(task.createdAt)}</span>
                                </div>

                                {task.completedAt && (
                                  <p className="mt-1 text-xs text-emerald-400">
                                    🏁 Finalizada em {formatDate(task.completedAt)}
                                  </p>
                                )}
                              </div>

                              <div className="flex flex-wrap gap-2">
                                {!task.done && (
                                  <>
                                    <button
                                      onClick={() => selectTask(task.id)}
                                      disabled={running}
                                      className={`rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40 ${
                                        selectedTaskId === task.id
                                          ? "bg-cyan-500 text-slate-950"
                                          : "border border-slate-700 hover:bg-slate-800"
                                      }`}
                                    >
                                      {selectedTaskId === task.id
                                        ? "✓ Seleccionada"
                                        : "🎯 Seleccionar"}
                                    </button>

                                    <button
                                      onClick={() => finishTask(task)}
                                      disabled={running && selectedTaskId === task.id}
                                      className="rounded-lg border border-emerald-900 px-3 py-2 text-xs text-emerald-400 hover:bg-emerald-950 disabled:opacity-40"
                                    >
                                      🏁 Finalizar
                                    </button>
                                  </>
                                )}

                                {task.done && (
                                  <button
                                    onClick={() => reopenTask(task)}
                                    className="rounded-lg border border-cyan-900 px-3 py-2 text-xs text-cyan-400 hover:bg-cyan-950"
                                  >
                                    ↩️ Reabrir
                                  </button>
                                )}

                                <button
                                  onClick={() => deleteTask(task)}
                                  disabled={running && selectedTaskId === task.id}
                                  className="rounded-lg px-3 py-2 text-xs text-rose-400 hover:bg-rose-950 disabled:opacity-40"
                                >
                                  🗑️
                                </button>
                              </div>
                            </div>

                            {task.entries.length > 0 && (
                              <details className="mt-4 border-t border-slate-800 pt-3">
                                <summary className="cursor-pointer text-xs font-semibold text-cyan-400">
                                  📚 Histórico de tempo ({task.entries.length})
                                </summary>

                                <div className="mt-3 space-y-2">
                                  {[...task.entries].reverse().map((entry) => (
                                    <div
                                      key={entry.id}
                                      className="flex flex-wrap justify-between gap-2 rounded-lg bg-slate-900 p-3 text-xs"
                                    >
                                      <span className="text-slate-400">
                                        {formatDate(entry.date, true)}
                                      </span>
                                      <span className="font-mono text-emerald-400">
                                        +{formatTime(entry.durationMs, true)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </details>
                            )}
                          </article>
                        )
                      )}

                      {(taskView === "active" ? activeTasks : completedTasks).length ===
                        0 && (
                        <div className="rounded-xl border border-dashed border-slate-700 py-10 text-center">
                          <p className="text-3xl">
                            {taskView === "active" ? "🌱" : "🏁"}
                          </p>
                          <p className="mt-2 text-sm text-slate-400">
                            {taskView === "active"
                              ? "Não tens tarefas activas."
                              : "Ainda não finalizaste tarefas."}
                          </p>
                        </div>
                      )}
                    </div>
                  </section>
                )}
              </>
            )}

            {section === "reports" && (
              <section className="space-y-5">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                  <div>
                    <h3 className="text-2xl font-bold">📊 Relatórios</h3>
                    <p className="mt-1 text-sm text-slate-400">
                      Analisa como distribuis o teu tempo.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <select
                      value={period}
                      onChange={(event) => setPeriod(event.target.value as Period)}
                      className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm"
                    >
                      <option value="today">Hoje</option>
                      <option value="7days">Últimos 7 dias</option>
                      <option value="30days">Últimos 30 dias</option>
                      <option value="all">Todo o período</option>
                    </select>

                    <button
                      onClick={exportReport}
                      className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400"
                    >
                      📥 Exportar CSV
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <StatCard
                    icon="⏱️"
                    label="Tempo no período"
                    value={formatTime(periodTotal)}
                    highlight
                  />
                  <StatCard
                    icon="🧾"
                    label="Sessões registadas"
                    value={String(filteredEntries.length)}
                  />
                  <StatCard
                    icon="📋"
                    label="Total de tarefas"
                    value={String(tasks.length)}
                  />
                  <StatCard
                    icon="🏁"
                    label="Tarefas finalizadas"
                    value={String(completedTasks.length)}
                  />
                </div>

                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
                    <h4 className="font-bold">🏷️ Tempo por categoria</h4>
                    <p className="mt-1 text-xs text-slate-400">
                      Proporção do tempo registado no período.
                    </p>

                    <div className="mt-5 space-y-4">
                      {reportCategoryTotals.map((category) => (
                        <div key={category.name}>
                          <div className="mb-1.5 flex justify-between gap-3 text-sm">
                            <span>
                              {category.icon} {category.name}
                            </span>
                            <span className="font-mono text-slate-400">
                              {formatTime(category.total)}
                            </span>
                          </div>

                          <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
                            <div
                              className={`h-full rounded-full ${category.color}`}
                              style={{
                                width: `${
                                  (category.total / maxReportCategory) * 100
                                }%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
                    <h4 className="font-bold">🎯 Tarefas com mais tempo</h4>
                    <p className="mt-1 text-xs text-slate-400">
                      Ordenadas pela duração registada no período.
                    </p>

                    <div className="mt-4 space-y-3">
                      {taskTotals.slice(0, 8).map((task) => (
                        <div
                          key={task.id}
                          className="flex items-center justify-between gap-3 rounded-lg bg-slate-950 p-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">
                              {task.title}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {categoryInfo(task.category).icon} {task.category}
                            </p>
                          </div>

                          <span className="whitespace-nowrap font-mono text-xs text-cyan-400">
                            {formatTime(task.reportTime)}
                          </span>
                        </div>
                      ))}

                      {taskTotals.length === 0 && (
                        <p className="py-6 text-center text-sm text-slate-500">
                          Ainda não existem sessões neste período.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
                  <h4 className="font-bold">🧾 Histórico de actividades</h4>
                  <p className="mt-1 text-xs text-slate-400">
                    Todos os registos de tempo do período seleccionado.
                  </p>

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
                        {[...filteredEntries]
                          .sort(
                            (a, b) =>
                              new Date(b.date).getTime() -
                              new Date(a.date).getTime()
                          )
                          .map((entry) => (
                            <tr
                              key={entry.id}
                              className="border-b border-slate-800/70"
                            >
                              <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-400">
                                {formatDate(entry.date, true)}
                              </td>
                              <td className="px-3 py-3">{entry.taskTitle}</td>
                              <td className="px-3 py-3">
                                {categoryInfo(entry.category).icon} {entry.category}
                              </td>
                              <td className="whitespace-nowrap px-3 py-3 font-mono text-cyan-400">
                                {formatTime(entry.durationMs, true)}
                              </td>
                              <td className="px-3 py-3 text-xs">
                                {entry.taskDone ? "✅ Finalizada" : "🔵 Activa"}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>

                  {filteredEntries.length === 0 && (
                    <p className="py-8 text-center text-sm text-slate-500">
                      {currentDate
                        ? "Não existem registos neste período."
                        : "A preparar os relatórios..."}
                    </p>
                  )}
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
        <span className="mr-2">{icon}</span>
        {label}
      </p>
      <p
        className={`mt-3 break-words text-2xl font-bold tracking-tight ${
          highlight ? "text-cyan-400" : "text-slate-100"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
