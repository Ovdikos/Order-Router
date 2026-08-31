import { registerDecorator, ValidationOptions } from 'class-validator';

const CLIENT_ID_REGEX = /^cl_[a-zA-Z0-9]+$/;

export function IsClientId(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isClientId',
      target: (object as { constructor: Function }).constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && CLIENT_ID_REGEX.test(value);
        },
        defaultMessage(): string {
          return 'must match format cl_<alphanum>';
        },
      },
    });
  };
}
