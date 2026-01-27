import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { http } from "../../api/http";
import type { AuthResponse } from "../../api/types";

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const { data } = await http.post<AuthResponse>("/api/users/login", formData);
      localStorage.setItem("email", String(data.email));
      localStorage.setItem("username", String(data.username));
      localStorage.setItem("balance", String(data.balance));
      
      // Перенаправляем на страницу комнат
      navigate("/rooms");
    } catch (err: any) {
      const message = err?.response?.data?.error || err?.message || "Ошибка входа";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  return (
    <div className="h-screen w-screen bg-[#070707] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-[#1a1a1a] rounded-lg shadow-xl p-8 border border-gray-700">
          {/* Заголовок */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-[#ffffff] mb-2">♠ Покер Дро ♠</h1>
            <p className="text-[#9ca3af]">Войдите в свой аккаунт</p>
          </div>

          {/* Форма */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Поле email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-[#d1d5db] mb-2">
                Email
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 bg-[#2d2d2d] border border-gray-600 rounded-lg text-[#ffffff] placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                placeholder="Введите email"
              />
            </div>

            {/* Поле пароля */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[#d1d5db] mb-2">
                Пароль
              </label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 bg-[#2d2d2d] border border-gray-600 rounded-lg text-[#ffffff] placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                placeholder="Введите пароль"
              />
            </div>

            {/* Сообщение об ошибке */}
            {error && (
              <div className="bg-[#7f1d1d] border border-[#991b1b] text-[#fca5a5] px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {/* Кнопка входа */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-[#ffffff] font-medium py-3 px-4 rounded-lg transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Вход..." : "Войти"}
            </button>
          </form>

          {/* Ссылка на регистрацию */}
          <div className="mt-6 text-center">
            <p className="text-[#9ca3af]">
              Нет аккаунта?{" "}
              <Link
                to="/register"
                className="text-blue-500 hover:text-blue-400 font-medium transition"
              >
                Зарегистрироваться
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
