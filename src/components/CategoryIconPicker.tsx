
"use client";

type Props = {
  value: string;
  onChange: (icon: string) => void;
};

const ICONS = [
  "📌", "💼", "📚", "🚀", "🤝", "🌱",
  "💻", "🛠️", "🔐", "🌐", "📞", "🏥",
  "🧪", "🎓", "🏋️", "🏃", "🏠", "🛒",
  "🚗", "✈️", "🎮", "🎯", "📝", "📊",
  "💰", "❤️", "🧠", "🗓️", "☕", "🍽️",
  "💤", "🎨", "📦", "⚙️", "🛡️", "🖥️",
  "🔧", "📈", "📅", "🎵", "🏆", "🌍",
  "🔬", "🧰", "📧", "🧹", "🧑‍💻", "⚽",
];

export default function CategoryIconPicker({ value, onChange }: Props) {
  return (
    <div className="w-full min-w-0">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-100">
            Escolhe um ícone
          </h4>
          <p className="mt-1 text-xs text-slate-400">
            Selecciona o símbolo que melhor representa a categoria.
          </p>
        </div>

        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-cyan-500/40 bg-cyan-950/40 text-2xl"
          aria-label={`Ícone seleccionado: ${value}`}
        >
          {value || "📌"}
        </div>
      </div>

      <div className="grid grid-cols-6 gap-2 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12">
        {ICONS.map((icon, index) => {
          const selected = value === icon;

          return (
            <button
              key={`${icon}-${index}`}
              type="button"
              aria-label={`Escolher ícone ${icon}`}
              aria-pressed={selected}
              title={icon}
              onClick={() => onChange(icon)}
              className={`flex aspect-square min-w-0 items-center justify-center rounded-xl border text-xl transition duration-150 hover:-translate-y-0.5 hover:border-cyan-400 hover:bg-slate-800 sm:text-2xl ${
                selected
                  ? "border-cyan-400 bg-cyan-950 ring-2 ring-cyan-500/30"
                  : "border-slate-800 bg-slate-900"
              }`}
            >
              {icon}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-slate-500">
        {ICONS.length} ícones disponíveis · A selecção é guardada com a categoria.
      </p>
    </div>
  );
}
