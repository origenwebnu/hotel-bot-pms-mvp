import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  BadGatewayException,
} from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type Transporter from 'nodemailer/lib/mailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;

  isConfigured(): boolean {
    return Boolean(
      process.env.SMTP_HOST?.trim() &&
        process.env.SMTP_USER?.trim() &&
        process.env.SMTP_PASS?.trim(),
    );
  }

  private buildTransportOptions(): SMTPTransport.Options {
    const host = process.env.SMTP_HOST?.trim() ?? 'smtp.gmail.com';
    const user = process.env.SMTP_USER?.trim() ?? '';
    const pass = process.env.SMTP_PASS?.trim() ?? '';
    const port = Number(process.env.SMTP_PORT ?? 587);
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;

    if (host === 'smtp.gmail.com') {
      return {
        host: 'smtp.gmail.com',
        port,
        secure,
        requireTLS: !secure,
        auth: { user, pass },
        tls: { minVersion: 'TLSv1.2' },
      };
    }

    return { host, port, secure, auth: { user, pass } };
  }

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;

    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS?.trim();

    if (!user || !pass) {
      const missing = [
        !process.env.SMTP_HOST?.trim() && 'SMTP_HOST',
        !user && 'SMTP_USER',
        !pass && 'SMTP_PASS',
      ].filter(Boolean);

      this.logger.error(`SMTP incompleto — faltan: ${missing.join(', ')}`);

      throw new ServiceUnavailableException(
        'El envío de email no está configurado en el servidor. Contacta soporte BookiChat.',
      );
    }

    this.transporter = nodemailer.createTransport(this.buildTransportOptions());
    return this.transporter;
  }

  private getFromAddress(): string {
    const user = process.env.SMTP_USER?.trim() ?? 'noreply@bookichat.com';
    const raw = process.env.SMTP_FROM?.trim();
    if (raw && raw.includes('@')) return raw;
    return `BookiChat <${user}>`;
  }

  async sendRegistrationCode(
    email: string,
    code: string,
    hotelName: string,
  ): Promise<void> {
    const from = this.getFromAddress();

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

    try {
      const transporter = this.getTransporter();
      await transporter.sendMail({ from, to: email, subject, text, html });
      this.logger.log(`Código de registro enviado a ${email}`);
    } catch (err) {
      this.logSmtpError(err);
      throw new BadGatewayException(this.toUserMessage(err));
    }
  }

  private logSmtpError(err: unknown): void {
    const e = err as { code?: string; response?: string; message?: string };
    this.logger.error(
      `Error SMTP [${e.code ?? 'UNKNOWN'}]: ${e.response ?? e.message ?? err}`,
    );
  }

  private toUserMessage(err: unknown): string {
    const e = err as { code?: string; response?: string; message?: string };
    const code = e.code ?? '';
    const response = (e.response ?? e.message ?? '').toLowerCase();

    if (code === 'EAUTH' || response.includes('username and password not accepted')) {
      return 'Credenciales SMTP incorrectas. Regenera la contraseña de aplicación en Google e actualiza SMTP_PASS en el servidor.';
    }
    if (code === 'ETIMEDOUT' || code === 'ECONNECTION' || code === 'ESOCKET') {
      return 'No se pudo conectar al servidor de Gmail desde el droplet. Revisa firewall o prueba puerto 465.';
    }
    if (response.includes('daily user sending limit')) {
      return 'Gmail bloqueó envíos por límite diario. Intenta mañana o usa otro proveedor SMTP.';
    }
    return 'No se pudo enviar el email. Ejecuta en el servidor: bash infra/digitalocean/test-smtp.sh';
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
