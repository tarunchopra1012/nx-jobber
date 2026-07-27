import { Injectable, UnauthorizedException } from '@nestjs/common';
import { LoginInput } from './dto/login.input';
import { Response } from 'express';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TokenPayload } from './token-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  async login({ email, password }: LoginInput, response: Response) {
    try {
      const user = await this.verifyUser(email, password);
      const expires = new Date();
      expires.setMilliseconds(
        expires.getMilliseconds() +
          parseInt(this.configService.get('JWT_EXPIRES_MS')),
      );
      const tokenPayload: TokenPayload = {
        userId: user.id,
      };
      const accessToken = this.jwtService.sign(tokenPayload);
      response.cookie('Authentication', accessToken, {
        httpOnly: true,
        secure: this.configService.get('NODE_ENV') === 'production',
        expires,
      });
      return user;
    } catch (error) {
      console.error(error);
      throw new UnauthorizedException('Credentials are not valid.');
    }
  }

  private async verifyUser(email: string, password: string) {
    try {
      const user = await this.usersService.getUser({ email });
      const authenticated = await bcrypt.compare(password, user.password);
      if (!authenticated) {
        throw new UnauthorizedException('Invalid credentials');
      }
      return user;
    } catch (error) {
      console.error(error);
      throw new UnauthorizedException('Credentials are not valid.');
    }
  }
}
