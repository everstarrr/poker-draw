import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { http } from "../../api/http";
import type { AuthResponse } from "../../api/types";

const Register: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: "",
    username: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Валидация
    if (formData.password !== formData.confirmPassword) {
      setError("Пароли не совпадают");
      return;
    }

    if (formData.password.length < 6) {
      setError("Пароль должен быть не менее 6 символов");
      return;
    }

    if (formData.username.length < 3) {
      setError("Логин должен быть не менее 3 символов");
      return;
    }

    setIsLoading(true);

    try {
      const { data } = await http.post<AuthResponse>("/api/users/register", {
        email: formData.email,
        username: formData.username,
        password: formData.password,
      });
      localStorage.setItem("email", String(data.email));
      localStorage.setItem("username", String(data.username));
      localStorage.setItem("balance", String(data.balance));
      
      // Перенаправляем на страницу комнат
      navigate("/rooms");
    } catch (err: any) {
      const message = err?.response?.data?.error || err?.message || "Ошибка регистрации";
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
    <div className="w-screen h-screen bg-[#070707] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-[#1a1a1a] rounded-lg shadow-xl p-8 border border-gray-700">
          {/* Заголовок */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-[#ffffff] mb-2">♠ Покер Дро ♠</h1>
            <p className="text-[#9ca3af]">Создайте новый аккаунт</p>
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

            {/* Поле логина */}
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-[#d1d5db] mb-2">
                Имя пользователя
              </label>
              <input
                type="text"
                id="username"
                name="username"
                value={formData.username}
                onChange={handleChange}
                required
                minLength={3}
                className="w-full px-4 py-3 bg-[#2d2d2d] border border-gray-600 rounded-lg text-[#ffffff] placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                placeholder="Минимум 3 символа"
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
                minLength={6}
                className="w-full px-4 py-3 bg-[#2d2d2d] border border-gray-600 rounded-lg text-[#ffffff] placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                placeholder="Минимум 6 символов"
              />
            </div>

            {/* Поле подтверждения пароля */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-[#d1d5db] mb-2">
                Подтверждение пароля
              </label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 bg-[#2d2d2d] border border-gray-600 rounded-lg text-[#ffffff] placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                placeholder="Повторите пароль"
              />
            </div>

            {/* Сообщение об ошибке */}
            {error && (
              <div className="bg-[#7f1d1d] border border-[#991b1b] text-[#fca5a5] px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {/* Кнопка регистрации */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-green-600 hover:bg-green-700 text-[#ffffff] font-medium py-3 px-4 rounded-lg transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Регистрация..." : "Зарегистрироваться"}
            </button>
          </form>

          {/* Ссылка на вход */}
          <div className="mt-6 text-center">
            <p className="text-[#9ca3af]">
              Уже есть аккаунт?{" "}
              <Link
                to="/login"
                className="text-blue-500 hover:text-blue-400 font-medium transition"
              >
                Войти
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;
