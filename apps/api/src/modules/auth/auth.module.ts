import { Body, Controller, Get, Injectable, Module, Post, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { IsString } from 'class-validator';
import { Repository } from 'typeorm';
import { AuthUser, CurrentUser, Public } from '../../common/auth';
import { Utilisateur } from '../../entities';

class LoginDto {
  @IsString() login: string;
  @IsString() password: string;
}

class RefreshDto {
  @IsString() refreshToken: string;
}

const MAX_ECHECS = 5;

@Injectable()
export class AuthService {
  constructor(@InjectRepository(Utilisateur) private readonly users: Repository<Utilisateur>, private readonly jwt: JwtService) {}

  static hash(password: string) {
    return bcrypt.hashSync(password, 10);
  }

  private async tokens(u: Utilisateur) {
    const base = { sub: u.id, login: u.login, role: u.role, codeRp: u.codeRp };
    return {
      accessToken: await this.jwt.signAsync({ ...base, typ: 'access' }, { expiresIn: process.env.JWT_ACCESS_TTL ?? '15m' }),
      refreshToken: await this.jwt.signAsync({ sub: u.id, typ: 'refresh' }, { expiresIn: `${process.env.JWT_REFRESH_TTL_DAYS ?? 30}d` }),
      utilisateur: { id: u.id, login: u.login, nom: u.nom, prenom: u.prenom, role: u.role, codeRp: u.codeRp },
    };
  }

  async login(login: string, password: string) {
    const u = await this.users.createQueryBuilder('u').addSelect('u.passwordHash').where('u.login = :login', { login }).getOne();
    if (!u || u.statut !== 'ACTIF' || u.deletedAt) throw new UnauthorizedException('Identifiants invalides');
    if (u.echecsConnexion >= MAX_ECHECS) throw new UnauthorizedException('Compte verrouillé, contactez l’administrateur');
    if (!bcrypt.compareSync(password, u.passwordHash)) {
      u.echecsConnexion += 1;
      await this.users.save(u);
      throw new UnauthorizedException('Identifiants invalides');
    }
    u.echecsConnexion = 0;
    u.derniereConnexion = new Date();
    await this.users.save(u);
    return this.tokens(u);
  }

  async refresh(token: string) {
    try {
      const p = await this.jwt.verifyAsync(token);
      if (p.typ !== 'refresh') throw new Error();
      const u = await this.users.findOneByOrFail({ id: p.sub });
      if (u.statut !== 'ACTIF' || u.deletedAt) throw new Error();
      return this.tokens(u);
    } catch {
      throw new UnauthorizedException('Jeton de rafraîchissement invalide');
    }
  }
}

@Controller('auth')
class AuthController {
  constructor(private readonly auth: AuthService, @InjectRepository(Utilisateur) private readonly users: Repository<Utilisateur>) {}

  @Public() @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.login, dto.password);
  }

  @Public() @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.users.findOneByOrFail({ id: user.id });
  }
}

@Module({ imports: [TypeOrmModule.forFeature([Utilisateur])], controllers: [AuthController], providers: [AuthService], exports: [AuthService] })
export class AuthModule {}
