import React from "react";
import { useNavigate } from "react-router-dom";

const Rules: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen w-screen bg-[#070707] p-6">
      <div className="max-w-4xl mx-auto">
        {/* Шапка с кнопкой назад */}
        <div className="bg-[#1a1a1a] rounded-lg shadow-xl p-6 mb-6 border border-gray-700">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-[#ffffff]">📖 Правила Покер Дро</h1>
            <button
              onClick={() => navigate(-1)}
              className="bg-[#374151] hover:bg-[#4b5563] text-[#ffffff] font-medium py-2 px-6 rounded-lg transition duration-200"
            >
              ← Назад
            </button>
          </div>
        </div>

        {/* Контент правил */}
        <div className="bg-[#1a1a1a] rounded-lg shadow-xl p-8 border border-gray-700 space-y-6">
          
          {/* Общая идея */}
          <section>
            <h2 className="text-2xl font-bold text-[#ffffff] mb-3 flex items-center gap-2">
              🎴 Общая идея
            </h2>
            <p className="text-[#d1d5db] leading-relaxed">
              Каждому игроку раздаётся по 5 карт. После одного раунда торговли игроки могут обменять часть карт, 
              затем следует финальная ставка и вскрытие. Побеждает лучшая покерная комбинация.
            </p>
          </section>

          {/* Количество игроков */}
          <section>
            <h2 className="text-2xl font-bold text-[#ffffff] mb-3 flex items-center gap-2">
              👥 Количество игроков
            </h2>
            <div className="text-[#d1d5db] space-y-2">
              <p className="font-semibold text-[#ffffff]">От 2 до 6</p>
              <p>Используется стандартная колода 52 карты, без джокеров</p>
            </div>
          </section>

          {/* Блайнды */}
          <section>
            <h2 className="text-2xl font-bold text-[#ffffff] mb-3 flex items-center gap-2">
              🪙 Блайнды / Анте
            </h2>
            <div className="text-[#d1d5db] space-y-2">
              <p>Перед раздачей:</p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>Либо все игроки ставят анте (обязательная ставка)</li>
                <li>Либо используются малый и большой блайнд (по договорённости)</li>
              </ul>
            </div>
          </section>

          {/* Ход игры */}
          <section>
            <h2 className="text-2xl font-bold text-[#ffffff] mb-4 flex items-center gap-2">
              🔄 Ход игры (по шагам)
            </h2>
            <div className="space-y-4">
              
              <div className="bg-[#2d2d2d] p-4 rounded-lg border border-gray-600">
                <h3 className="text-xl font-semibold text-[#ffffff] mb-2">1️⃣ Раздача</h3>
                <p className="text-[#d1d5db]">Каждому игроку по 5 карт в закрытую</p>
              </div>

              <div className="bg-[#2d2d2d] p-4 rounded-lg border border-gray-600">
                <h3 className="text-xl font-semibold text-[#ffffff] mb-2">2️⃣ Первый раунд торговли</h3>
                <p className="text-[#d1d5db] mb-2">Игроки по очереди могут:</p>
                <ul className="list-disc list-inside space-y-1 ml-4 text-[#d1d5db]">
                  <li><span className="font-semibold text-[#ffffff]">Чек</span> — если никто не ставил</li>
                  <li><span className="font-semibold text-[#ffffff]">Бет</span> — сделать ставку</li>
                  <li><span className="font-semibold text-[#ffffff]">Колл</span> — уравнять ставку</li>
                  <li><span className="font-semibold text-[#ffffff]">Рейз</span> — повысить</li>
                  <li><span className="font-semibold text-[#ffffff]">Фолд</span> — сбросить карты</li>
                </ul>
              </div>

              <div className="bg-[#2d2d2d] p-4 rounded-lg border border-gray-600">
                <h3 className="text-xl font-semibold text-[#ffffff] mb-2">3️⃣ Обмен карт (дро)</h3>
                <ul className="list-disc list-inside space-y-1 ml-4 text-[#d1d5db]">
                  <li>Каждый игрок может обменять от 0 до 3 карт</li>
                  <li>В некоторых вариантах — до 4 карт</li>
                  <li>Карты сбрасываются и заменяются новыми из колоды</li>
                </ul>
              </div>

              <div className="bg-[#2d2d2d] p-4 rounded-lg border border-gray-600">
                <h3 className="text-xl font-semibold text-[#ffffff] mb-2">4️⃣ Второй раунд торговли</h3>
                <p className="text-[#d1d5db]">Проходит так же, как первый</p>
              </div>

              <div className="bg-[#2d2d2d] p-4 rounded-lg border border-gray-600">
                <h3 className="text-xl font-semibold text-[#ffffff] mb-2">5️⃣ Вскрытие (Showdown)</h3>
                <ul className="list-disc list-inside space-y-1 ml-4 text-[#d1d5db]">
                  <li>Все оставшиеся игроки открывают карты</li>
                  <li>Побеждает лучшая комбинация</li>
                  <li>Банк забирает победитель</li>
                  <li>При равенстве — банк делится</li>
                </ul>
              </div>

            </div>
          </section>

          {/* Комбинации */}
          <section>
            <h2 className="text-2xl font-bold text-[#ffffff] mb-4 flex items-center gap-2">
              🏆 Комбинации (от сильной к слабой)
            </h2>
            <div className="space-y-2">
              <div className="flex items-start gap-3 p-3 bg-[#2d2d2d] rounded-lg border border-gray-600">
                <span className="font-bold text-yellow-400 min-w-[30px]">1.</span>
                <div>
                  <span className="font-semibold text-[#ffffff]">Роял-флеш</span>
                  <span className="text-[#9ca3af]"> — A K Q J 10 одной масти</span>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 bg-[#2d2d2d] rounded-lg border border-gray-600">
                <span className="font-bold text-yellow-400 min-w-[30px]">2.</span>
                <div>
                  <span className="font-semibold text-[#ffffff]">Стрит-флеш</span>
                  <span className="text-[#9ca3af]"> — 5 карт по порядку одной масти</span>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 bg-[#2d2d2d] rounded-lg border border-gray-600">
                <span className="font-bold text-yellow-400 min-w-[30px]">3.</span>
                <div>
                  <span className="font-semibold text-[#ffffff]">Каре</span>
                  <span className="text-[#9ca3af]"> — 4 карты одного достоинства</span>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 bg-[#2d2d2d] rounded-lg border border-gray-600">
                <span className="font-bold text-yellow-400 min-w-[30px]">4.</span>
                <div>
                  <span className="font-semibold text-[#ffffff]">Фулл-хаус</span>
                  <span className="text-[#9ca3af]"> — тройка + пара</span>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 bg-[#2d2d2d] rounded-lg border border-gray-600">
                <span className="font-bold text-yellow-400 min-w-[30px]">5.</span>
                <div>
                  <span className="font-semibold text-[#ffffff]">Флеш</span>
                  <span className="text-[#9ca3af]"> — 5 карт одной масти</span>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 bg-[#2d2d2d] rounded-lg border border-gray-600">
                <span className="font-bold text-yellow-400 min-w-[30px]">6.</span>
                <div>
                  <span className="font-semibold text-[#ffffff]">Стрит</span>
                  <span className="text-[#9ca3af]"> — 5 карт по порядку</span>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 bg-[#2d2d2d] rounded-lg border border-gray-600">
                <span className="font-bold text-yellow-400 min-w-[30px]">7.</span>
                <div>
                  <span className="font-semibold text-[#ffffff]">Тройка</span>
                  <span className="text-[#9ca3af]"> — 3 карты одного достоинства</span>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 bg-[#2d2d2d] rounded-lg border border-gray-600">
                <span className="font-bold text-yellow-400 min-w-[30px]">8.</span>
                <div>
                  <span className="font-semibold text-[#ffffff]">Две пары</span>
                  <span className="text-[#9ca3af]"> — 2 пары карт</span>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 bg-[#2d2d2d] rounded-lg border border-gray-600">
                <span className="font-bold text-yellow-400 min-w-[30px]">9.</span>
                <div>
                  <span className="font-semibold text-[#ffffff]">Одна пара</span>
                  <span className="text-[#9ca3af]"> — 2 карты одного достоинства</span>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 bg-[#2d2d2d] rounded-lg border border-gray-600">
                <span className="font-bold text-yellow-400 min-w-[30px]">10.</span>
                <div>
                  <span className="font-semibold text-[#ffffff]">Старшая карта</span>
                  <span className="text-[#9ca3af]"> — если нет комбинаций</span>
                </div>
              </div>
            </div>
          </section>

          {/* Дополнительные правила */}
          <section>
            <h2 className="text-2xl font-bold text-[#ffffff] mb-3 flex items-center gap-2">
              ⚠️ Дополнительные правила (по желанию)
            </h2>
            <ul className="list-disc list-inside space-y-2 ml-4 text-[#d1d5db]">
              <li>Лимит на количество рейзов</li>
              <li>Минимальная комбинация для входа (например, «пара валетов или выше»)</li>
              <li>Джокеры (в нестандартных версиях)</li>
            </ul>
          </section>

        </div>
      </div>
    </div>
  );
};

export default Rules;
