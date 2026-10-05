import { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from 'sonner';

export default function LoginPage() {
    const [roomName, setRoomName] = useState('');

    const handleCreateRoom = (e: React.FormEvent) => {
        e.preventDefault();
        if (!roomName.trim()) {
            toast.error('Пожалуйста, введите название комнаты!');
            return;
        }

        // Имитация успешного действия
        toast.success(`Комната "${roomName}" успешно создана!`, {
            description: 'Теперь можно подключать PeerJS',
        });
        setRoomName('');
    };

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 antialiased text-foreground">
            {/* Главная карточка shadcn */}
            <Card className="w-full max-w-md shadow-lg transition-all duration-300 hover:shadow-xl">
                <CardHeader className="space-y-1">
                    <CardTitle className="text-2xl font-bold tracking-tight">
                        🍿 Watch Together
                    </CardTitle>
                    <CardDescription>
                        Создайте комнату для совместного просмотра видео
                    </CardDescription>
                </CardHeader>

                <form onSubmit={handleCreateRoom}>
                    <CardContent className="space-y-4">
                        <div className="space-y-1">
                            <label htmlFor="room" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                Название комнаты
                            </label>
                            {/* Инпут shadcn */}
                            <Input
                                id="room"
                                type="text"
                                placeholder="Например: Сериалы на вечер"
                                value={roomName}
                                onChange={(e) => setRoomName(e.target.value)}
                                className="w-full"
                            />
                        </div>
                    </CardContent>

                    <CardFooter>
                        {/* Кнопка shadcn */}
                        <Button type="submit" className="w-full font-semibold cursor-pointer">
                            Создать сессию
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}