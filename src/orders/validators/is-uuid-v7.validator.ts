import { registerDecorator, ValidationOptions } from 'class-validator';
import { validate, version } from 'uuid';

export function IsUuidV7(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isUuidV7',
      target: (object as { constructor: Function }).constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return (
            typeof value === 'string' &&
            validate(value) &&
            version(value) === 7
          );
        },
        defaultMessage(): string {
          return 'must be a valid UUID v7';
        },
      },
    });
  };
}
