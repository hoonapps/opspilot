import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AuthzService } from "./authz.service";

@ApiTags("authz")
@Controller("permission-boundary")
export class AuthzController {
  constructor(private readonly authzService: AuthzService) {}

  @Get("matrix")
  getPermissionBoundaryMatrix() {
    return this.authzService.getPermissionBoundaryMatrix();
  }
}
