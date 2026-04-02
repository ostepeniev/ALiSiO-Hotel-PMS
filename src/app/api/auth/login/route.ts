import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { verifyPassword, createSession } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email та пароль обов\'язкові' }, { status: 400 });
    }

    const db = getDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user: any = db.prepare(
      'SELECT id, email, full_name, role, password_hash, is_active FROM app_users WHERE email = ?'
    ).get(email);

    if (!user) {
      return NextResponse.json({ error: 'Невірний email або пароль' }, { status: 401 });
    }

    if (!user.is_active) {
      return NextResponse.json({ error: 'Обліковий запис деактивовано' }, { status: 403 });
    }

    if (!user.password_hash) {
      return NextResponse.json({ error: 'Пароль не встановлено. Зверніться до адміністратора.' }, { status: 403 });
    }

    const valid = verifyPassword(password, user.password_hash);
    if (!valid) {
      return NextResponse.json({ error: 'Невірний email або пароль' }, { status: 401 });
    }

    // Update last_login
    db.prepare('UPDATE app_users SET last_login = datetime(\'now\') WHERE id = ?').run(user.id);

    // Create session
    const sessionId = createSession(user.id);

    const response = NextResponse.json({ success: true, user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role } });
    response.cookies.set('session_id', sessionId, {
      httpOnly: true,
      secure: false, // dev mode
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Помилка сервера' }, { status: 500 });
  }
}
