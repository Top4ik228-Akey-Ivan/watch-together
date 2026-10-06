import LoginPage from '@/pages/LoginPage/LoginPage';
import RoomPage from '@/pages/RoomPage/RoomPage';
import { BrowserRouter, Routes, Route } from 'react-router';
import { Toaster } from 'sonner';

export default function AppRouter() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path='/' element={<LoginPage />} />
                <Route path='/room/:roomId' element={<RoomPage />} />
                <Route path="*" element={<div className="flex min-h-screen items-center justify-center">Страница не найдена</div>} />
            </Routes>
            <Toaster position="top-center" richColors closeButton />
        </BrowserRouter>
    )
}