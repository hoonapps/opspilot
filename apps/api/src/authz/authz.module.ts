import { Module } from "@nestjs/common";
import { AuthzController } from "./authz.controller";
import { AuthzService } from "./authz.service";

@Module({
  controllers: [AuthzController],
  providers: [AuthzService],
  exports: [AuthzService]
})
export class AuthzModule {}
