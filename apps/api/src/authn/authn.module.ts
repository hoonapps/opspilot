import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ActorTokenGuard } from "./actor-token.guard";

@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: ActorTokenGuard
    }
  ]
})
export class AuthnModule {}
