import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import type Transporter from 'nodemailer/lib/mailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;

  private getTransporter(): Transporter | null {
    if (this.transporter) return this.transporter;

    const host = process.env.SMTP_HOST?.trim();
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS?.trim();

    if (!host || !user || !pass) {
      return null;
    }

    const port = Number(process.env.SMTP_PORT ?? 587);
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });

    return this.transporter;
  }

  async sendRegistrationCode(email: string, code: string, hotelName: string): Promise<void> {
    const from =
      process.env.SMTP_FROM?.trim() || 'BookiChat <noreply@bookichat.com>';
    const subject = 'Tu código de verificación — BookiChat';
    const text = [
      `Hola,`,
      ``,
      `Tu código para registrar "${hotelName}" en BookiChat es:`,
      ``,
      `  ${code}`,
      ``,
      `Este código expira en 15 minutos.`,
      ``,
      `Si no solicitaste este registro, ignora este mensaje.`,
      ``,
      `— Equipo BookiChat`,
    ].join('\n');

    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#1a2332">
        <h2 style="color:#25d366">BookiChat</h2>
        <p>Verifica tu email para registrar <strong>${this.escapeHtml(hotelName)}</strong>.</p>
        <p style="font-size:32px;letter-spacing:8px;font-weight:700;text-align:center;padding:16px;background:#f4f6f8;border-radius:8px">${code}</p>
        <p style="color:#666;font-size:14px">Este código expira en <strong>15 minutos</strong>.</p>
        <p style="color:#999;font-size:12px">Si no solicitaste este registro, ignora este email.</p>
      </div>`;

    const transporter = this.getTransporter();

    if (!transporter) {
      this.logger.warn(
        `[DEV] SMTP no configurado — código para ${email}: ${code}`,
      );
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          'Servicio de email no configurado. Contacta soporte BookiChat.',
        );
      }
      return;
    }

    await transporter.sendMail({ from, to: email, subject, text, html });
    this.logger.log(`Código de registro enviado a ${email}`);
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
