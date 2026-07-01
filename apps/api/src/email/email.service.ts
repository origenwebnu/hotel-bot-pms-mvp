import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  BadGatewayException,
} from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type Transporter from 'nodemailer/lib/mailer';
import {
  renderMonthlyQuotaEmail,
  renderRegistrationCodeEmail,
  renderRestaurantReservationNotificationEmail,
  renderTrialExpiredEmail,
  renderTrialQuotaEmail,
} from './email-templates';

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

    const html = renderRegistrationCodeEmail(hotelName, code);

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

  private dashboardUrl(): string {
    return (process.env.APP_URL ?? 'https://app.bookichat.com').replace(/\/$/, '');
  }

  async sendTrialQuotaReached(
    email: string,
    hotelName: string,
    reservationLimit: number,
  ): Promise<void> {
    const dashboard = this.dashboardUrl();
    const subject = 'Periodo de prueba agotado — BookiChat';
    const text = [
      `Hola,`,
      ``,
      `El hotel "${hotelName}" alcanzó el límite de ${reservationLimit} reservas efectivas de su periodo de prueba en BookiChat.`,
      ``,
      `Para seguir recibiendo reservas por WhatsApp, ingresa a tu panel y elige un plan:`,
      `${dashboard}`,
      ``,
      `— Equipo BookiChat`,
    ].join('\n');

    const html = renderTrialQuotaEmail(hotelName, reservationLimit, dashboard);

    await this.sendOptional(email, subject, text, html, 'trial quota');
  }

  async sendTrialExpired(
    email: string,
    hotelName: string,
    reason: 'time' | 'quota',
  ): Promise<void> {
    const dashboard = this.dashboardUrl();
    const reasonText =
      reason === 'time'
        ? 'Los 15 días de prueba finalizaron.'
        : 'Se alcanzó el límite de reservas de prueba.';
    const subject = 'Tu periodo de prueba terminó — BookiChat';
    const text = [
      `Hola,`,
      ``,
      `${reasonText}`,
      `El hotel "${hotelName}" debe elegir un plan para seguir recibiendo reservas.`,
      ``,
      `Ingresa a: ${dashboard}`,
      ``,
      `— Equipo BookiChat`,
    ].join('\n');

    const html = renderTrialExpiredEmail(hotelName, reasonText, dashboard);

    await this.sendOptional(email, subject, text, html, 'trial expired');
  }

  async sendMonthlyQuotaReached(
    email: string,
    hotelName: string,
    planName: string,
    limit: number,
  ): Promise<void> {
    const dashboard = this.dashboardUrl();
    const subject = 'Límite mensual de reservas alcanzado — BookiChat';
    const text = [
      `Hola,`,
      ``,
      `El hotel "${hotelName}" alcanzó las ${limit} reservas incluidas en su plan "${planName}" este mes.`,
      ``,
      `Las nuevas reservas por WhatsApp están pausadas hasta que actualices a un plan superior.`,
      `Ingresa a: ${dashboard}`,
      ``,
      `— Equipo BookiChat`,
    ].join('\n');

    const html = renderMonthlyQuotaEmail(hotelName, planName, limit, dashboard);

    await this.sendOptional(email, subject, text, html, 'monthly quota');
  }

  async sendRestaurantReservationNotification(
    to: string,
    data: {
      restaurantName: string;
      guestName: string;
      guestPhone?: string | null;
      dateLabel: string;
      time: string;
      partySize: number;
      zoneName: string;
      occasionLabel?: string | null;
      totalLabel: string;
      specialRequests?: string | null;
      receiptUrl?: string | null;
    },
  ): Promise<void> {
    const subject = `Nueva reserva — ${data.guestName} · ${data.dateLabel}`;
    const text = [
      `Nueva reserva en ${data.restaurantName}`,
      ``,
      `Cliente: ${data.guestName}`,
      data.guestPhone ? `WhatsApp: ${data.guestPhone}` : '',
      `Fecha: ${data.dateLabel}`,
      `Hora: ${data.time}`,
      `Personas: ${data.partySize}`,
      `Zona: ${data.zoneName}`,
      data.occasionLabel ? `Motivo: ${data.occasionLabel}` : '',
      data.specialRequests?.trim() ? `Petición: ${data.specialRequests.trim()}` : '',
      `Total: ${data.totalLabel}`,
      data.receiptUrl ? `Recibo: ${data.receiptUrl}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const html = renderRestaurantReservationNotificationEmail(data);
    await this.sendOptional(to, subject, text, html, 'restaurant reservation');
  }

  private async sendOptional(
    to: string,
    subject: string,
    text: string,
    html: string,
    label: string,
  ): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn(`SMTP no configurado — email omitido (${label}) para ${to}`);
      return;
    }
    try {
      const transporter = this.getTransporter();
      await transporter.sendMail({
        from: this.getFromAddress(),
        to,
        subject,
        text,
        html,
      });
      this.logger.log(`Email ${label} enviado a ${to}`);
    } catch (err) {
      this.logSmtpError(err);
    }
  }

}
