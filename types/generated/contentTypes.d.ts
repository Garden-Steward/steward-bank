import type { Attribute, Schema } from '@strapi/strapi';

export interface AdminApiToken extends Schema.CollectionType {
  collectionName: 'strapi_api_tokens';
  info: {
    description: '';
    displayName: 'Api Token';
    name: 'Api Token';
    pluralName: 'api-tokens';
    singularName: 'api-token';
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    accessKey: Attribute.String &
      Attribute.Required &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    createdAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'admin::api-token',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    description: Attribute.String &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }> &
      Attribute.DefaultTo<''>;
    expiresAt: Attribute.DateTime;
    lastUsedAt: Attribute.DateTime;
    lifespan: Attribute.BigInteger;
    name: Attribute.String &
      Attribute.Required &
      Attribute.Unique &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    permissions: Attribute.Relation<
      'admin::api-token',
      'oneToMany',
      'admin::api-token-permission'
    >;
    type: Attribute.Enumeration<['read-only', 'full-access', 'custom']> &
      Attribute.Required &
      Attribute.DefaultTo<'read-only'>;
    updatedAt: Attribute.DateTime;
    updatedBy: Attribute.Relation<
      'admin::api-token',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface AdminApiTokenPermission extends Schema.CollectionType {
  collectionName: 'strapi_api_token_permissions';
  info: {
    description: '';
    displayName: 'API Token Permission';
    name: 'API Token Permission';
    pluralName: 'api-token-permissions';
    singularName: 'api-token-permission';
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    action: Attribute.String &
      Attribute.Required &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    createdAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'admin::api-token-permission',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    token: Attribute.Relation<
      'admin::api-token-permission',
      'manyToOne',
      'admin::api-token'
    >;
    updatedAt: Attribute.DateTime;
    updatedBy: Attribute.Relation<
      'admin::api-token-permission',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface AdminPermission extends Schema.CollectionType {
  collectionName: 'admin_permissions';
  info: {
    description: '';
    displayName: 'Permission';
    name: 'Permission';
    pluralName: 'permissions';
    singularName: 'permission';
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    action: Attribute.String &
      Attribute.Required &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    actionParameters: Attribute.JSON & Attribute.DefaultTo<{}>;
    conditions: Attribute.JSON & Attribute.DefaultTo<[]>;
    createdAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'admin::permission',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    properties: Attribute.JSON & Attribute.DefaultTo<{}>;
    role: Attribute.Relation<'admin::permission', 'manyToOne', 'admin::role'>;
    subject: Attribute.String &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    updatedAt: Attribute.DateTime;
    updatedBy: Attribute.Relation<
      'admin::permission',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface AdminRole extends Schema.CollectionType {
  collectionName: 'admin_roles';
  info: {
    description: '';
    displayName: 'Role';
    name: 'Role';
    pluralName: 'roles';
    singularName: 'role';
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    code: Attribute.String &
      Attribute.Required &
      Attribute.Unique &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    createdAt: Attribute.DateTime;
    createdBy: Attribute.Relation<'admin::role', 'oneToOne', 'admin::user'> &
      Attribute.Private;
    description: Attribute.String;
    name: Attribute.String &
      Attribute.Required &
      Attribute.Unique &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    permissions: Attribute.Relation<
      'admin::role',
      'oneToMany',
      'admin::permission'
    >;
    updatedAt: Attribute.DateTime;
    updatedBy: Attribute.Relation<'admin::role', 'oneToOne', 'admin::user'> &
      Attribute.Private;
    users: Attribute.Relation<'admin::role', 'manyToMany', 'admin::user'>;
  };
}

export interface AdminTransferToken extends Schema.CollectionType {
  collectionName: 'strapi_transfer_tokens';
  info: {
    description: '';
    displayName: 'Transfer Token';
    name: 'Transfer Token';
    pluralName: 'transfer-tokens';
    singularName: 'transfer-token';
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    accessKey: Attribute.String &
      Attribute.Required &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    createdAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'admin::transfer-token',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    description: Attribute.String &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }> &
      Attribute.DefaultTo<''>;
    expiresAt: Attribute.DateTime;
    lastUsedAt: Attribute.DateTime;
    lifespan: Attribute.BigInteger;
    name: Attribute.String &
      Attribute.Required &
      Attribute.Unique &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    permissions: Attribute.Relation<
      'admin::transfer-token',
      'oneToMany',
      'admin::transfer-token-permission'
    >;
    updatedAt: Attribute.DateTime;
    updatedBy: Attribute.Relation<
      'admin::transfer-token',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface AdminTransferTokenPermission extends Schema.CollectionType {
  collectionName: 'strapi_transfer_token_permissions';
  info: {
    description: '';
    displayName: 'Transfer Token Permission';
    name: 'Transfer Token Permission';
    pluralName: 'transfer-token-permissions';
    singularName: 'transfer-token-permission';
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    action: Attribute.String &
      Attribute.Required &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    createdAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'admin::transfer-token-permission',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    token: Attribute.Relation<
      'admin::transfer-token-permission',
      'manyToOne',
      'admin::transfer-token'
    >;
    updatedAt: Attribute.DateTime;
    updatedBy: Attribute.Relation<
      'admin::transfer-token-permission',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface AdminUser extends Schema.CollectionType {
  collectionName: 'admin_users';
  info: {
    description: '';
    displayName: 'User';
    name: 'User';
    pluralName: 'users';
    singularName: 'user';
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    blocked: Attribute.Boolean & Attribute.Private & Attribute.DefaultTo<false>;
    createdAt: Attribute.DateTime;
    createdBy: Attribute.Relation<'admin::user', 'oneToOne', 'admin::user'> &
      Attribute.Private;
    email: Attribute.Email &
      Attribute.Required &
      Attribute.Private &
      Attribute.Unique &
      Attribute.SetMinMaxLength<{
        minLength: 6;
      }>;
    firstname: Attribute.String &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    isActive: Attribute.Boolean &
      Attribute.Private &
      Attribute.DefaultTo<false>;
    lastname: Attribute.String &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    password: Attribute.Password &
      Attribute.Private &
      Attribute.SetMinMaxLength<{
        minLength: 6;
      }>;
    preferedLanguage: Attribute.String;
    registrationToken: Attribute.String & Attribute.Private;
    resetPasswordToken: Attribute.String & Attribute.Private;
    roles: Attribute.Relation<'admin::user', 'manyToMany', 'admin::role'> &
      Attribute.Private;
    updatedAt: Attribute.DateTime;
    updatedBy: Attribute.Relation<'admin::user', 'oneToOne', 'admin::user'> &
      Attribute.Private;
    username: Attribute.String;
  };
}

export interface ApiApplicationApplication extends Schema.CollectionType {
  collectionName: 'applications';
  info: {
    description: '';
    displayName: 'Application';
    pluralName: 'applications';
    singularName: 'application';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    city: Attribute.String;
    createdAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::application.application',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    description: Attribute.Text;
    email: Attribute.String;
    name: Attribute.String;
    primary_image: Attribute.Media<'images' | 'files' | 'videos' | 'audios'>;
    publishedAt: Attribute.DateTime;
    state: Attribute.String;
    title: Attribute.String;
    updatedAt: Attribute.DateTime;
    updatedBy: Attribute.Relation<
      'api::application.application',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface ApiBlogBlog extends Schema.CollectionType {
  collectionName: 'blogs';
  info: {
    description: '';
    displayName: 'Blog';
    pluralName: 'blogs';
    singularName: 'blog';
  };
  options: {
    draftAndPublish: true;
    populateCreatorFields: true;
  };
  attributes: {
    category: Attribute.Relation<
      'api::blog.blog',
      'oneToOne',
      'api::category.category'
    >;
    content: Attribute.Blocks;
    createdAt: Attribute.DateTime;
    createdBy: Attribute.Relation<'api::blog.blog', 'oneToOne', 'admin::user'>;
    excerpt: Attribute.Text;
    hero: Attribute.Media<'images'>;
    hero_display: Attribute.Boolean & Attribute.DefaultTo<true>;
    oembed: Attribute.Text & Attribute.CustomField<'plugin::oembed.oembed'>;
    plants: Attribute.Relation<
      'api::blog.blog',
      'oneToMany',
      'api::plant.plant'
    >;
    publishedAt: Attribute.DateTime;
    seo: Attribute.Component<'seo.seo-information'>;
    slug: Attribute.String;
    subtitle: Attribute.String;
    title: Attribute.String;
    updatedAt: Attribute.DateTime;
    updatedBy: Attribute.Relation<'api::blog.blog', 'oneToOne', 'admin::user'>;
  };
}

export interface ApiCategoryCategory extends Schema.CollectionType {
  collectionName: 'categories';
  info: {
    displayName: 'Category';
    pluralName: 'categories';
    singularName: 'category';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    createdAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::category.category',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    description: Attribute.Text;
    publishedAt: Attribute.DateTime;
    title: Attribute.String;
    updatedAt: Attribute.DateTime;
    updatedBy: Attribute.Relation<
      'api::category.category',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface ApiGardenTaskGardenTask extends Schema.CollectionType {
  collectionName: 'garden_tasks';
  info: {
    description: '';
    displayName: 'Garden Task';
    pluralName: 'garden-tasks';
    singularName: 'garden-task';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    complete_once: Attribute.Boolean & Attribute.DefaultTo<true>;
    completed_at: Attribute.DateTime;
    createdAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::garden-task.garden-task',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    garden: Attribute.Relation<
      'api::garden-task.garden-task',
      'oneToOne',
      'api::garden.garden'
    >;
    max_volunteers: Attribute.Integer;
    overview: Attribute.Text;
    primary_image: Attribute.Media<'images' | 'files' | 'videos' | 'audios'>;
    publishedAt: Attribute.DateTime;
    recurring_task: Attribute.Relation<
      'api::garden-task.garden-task',
      'oneToOne',
      'api::recurring-task.recurring-task'
    >;
    started_at: Attribute.DateTime;
    status: Attribute.Enumeration<
      [
        'INITIALIZED',
        'PENDING',
        'INTERESTED',
        'STARTED',
        'FINISHED',
        'ABANDONED',
        'ISSUE',
        'SKIPPED',
        'RESOLVED'
      ]
    >;
    title: Attribute.String;
    type: Attribute.Enumeration<
      ['General', 'Water', 'Weeding', 'Planting', 'Harvest']
    >;
    updatedAt: Attribute.DateTime;
    updatedBy: Attribute.Relation<
      'api::garden-task.garden-task',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    volunteer_day: Attribute.Relation<
      'api::garden-task.garden-task',
      'manyToOne',
      'api::volunteer-day.volunteer-day'
    >;
    volunteers: Attribute.Relation<
      'api::garden-task.garden-task',
      'oneToMany',
      'plugin::users-permissions.user'
    >;
  };
}

export interface ApiGardenGarden extends Schema.CollectionType {
  collectionName: 'gardens';
  info: {
    description: '';
    displayName: 'Garden';
    pluralName: 'gardens';
    singularName: 'garden';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    blurb: Attribute.Text;
    createdAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::garden.garden',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    latitude: Attribute.Float;
    longitude: Attribute.Float;
    managers: Attribute.Relation<
      'api::garden.garden',
      'oneToMany',
      'plugin::users-permissions.user'
    >;
    openweather_id: Attribute.Integer;
    organization: Attribute.Relation<
      'api::garden.garden',
      'manyToOne',
      'api::organization.organization'
    >;
    publishedAt: Attribute.DateTime;
    recurring_tasks: Attribute.Relation<
      'api::garden.garden',
      'oneToMany',
      'api::recurring-task.recurring-task'
    >;
    slug: Attribute.String;
    sms_slug: Attribute.String & Attribute.Required & Attribute.Unique;
    title: Attribute.String & Attribute.Required;
    updatedAt: Attribute.DateTime;
    updatedBy: Attribute.Relation<
      'api::garden.garden',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    volunteers: Attribute.Relation<
      'api::garden.garden',
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    welcome_text: Attribute.Text;
  };
}

export interface ApiInstructionInstruction extends Schema.CollectionType {
  collectionName: 'instructions';
  info: {
    description: '';
    displayName: 'Instruction';
    pluralName: 'instructions';
    singularName: 'instruction';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    accept_required: Attribute.Boolean;
    affirm_button_title: Attribute.String &
      Attribute.Required &
      Attribute.DefaultTo<'Accept'>;
    affirm_explain: Attribute.Text &
      Attribute.Required &
      Attribute.DefaultTo<"I understand this task's requirements and I am capable. I accept this task.">;
    card: Attribute.Component<'education.card', true>;
    content: Attribute.Blocks;
    createdAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::instruction.instruction',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    garden: Attribute.Relation<
      'api::instruction.instruction',
      'oneToOne',
      'api::garden.garden'
    >;
    publishedAt: Attribute.DateTime;
    slug: Attribute.String;
    title: Attribute.String;
    updatedAt: Attribute.DateTime;
    updatedBy: Attribute.Relation<
      'api::instruction.instruction',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface ApiInterestInterest extends Schema.CollectionType {
  collectionName: 'interests';
  info: {
    description: '';
    displayName: 'Interest';
    pluralName: 'interests';
    singularName: 'interest';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    createdAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::interest.interest',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    gardens: Attribute.Relation<
      'api::interest.interest',
      'oneToMany',
      'api::garden.garden'
    >;
    publishedAt: Attribute.DateTime;
    tag: Attribute.String;
    updatedAt: Attribute.DateTime;
    updatedBy: Attribute.Relation<
      'api::interest.interest',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface ApiLocationTrackingLocationTracking
  extends Schema.CollectionType {
  collectionName: 'location_trackings';
  info: {
    description: '';
    displayName: 'Location Tracking';
    pluralName: 'location-trackings';
    singularName: 'location-tracking';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    analysis: Attribute.Text;
    confidence: Attribute.Enumeration<
      ['high', 'medium', 'low', 'unknown', 'unverified']
    >;
    createdAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::location-tracking.location-tracking',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    is_plant: Attribute.Boolean;
    label: Attribute.String;
    last_verified: Attribute.DateTime;
    latitude: Attribute.Float;
    location_image: Attribute.Media<'images' | 'files' | 'videos' | 'audios'>;
    longitude: Attribute.Float;
    map_layer: Attribute.Enumeration<
      ['fruit_tree', 'pollinator', 'garden', 'other']
    >;
    plant: Attribute.Relation<
      'api::location-tracking.location-tracking',
      'oneToOne',
      'api::plant.plant'
    >;
    plant_image: Attribute.Media<'images' | 'files' | 'videos' | 'audios'>;
    planted_date: Attribute.Date;
    publishedAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    updatedBy: Attribute.Relation<
      'api::location-tracking.location-tracking',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    user: Attribute.Relation<
      'api::location-tracking.location-tracking',
      'oneToOne',
      'plugin::users-permissions.user'
    >;
  };
}

export interface ApiMessageMessage extends Schema.CollectionType {
  collectionName: 'messages';
  info: {
    description: '';
    displayName: 'Message';
    pluralName: 'messages';
    singularName: 'message';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    body: Attribute.Text;
    createdAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::message.message',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    event: Attribute.Relation<
      'api::message.message',
      'manyToOne',
      'api::volunteer-day.volunteer-day'
    >;
    garden: Attribute.Relation<
      'api::message.message',
      'oneToOne',
      'api::garden.garden'
    >;
    garden_task: Attribute.Relation<
      'api::message.message',
      'oneToOne',
      'api::garden-task.garden-task'
    >;
    meta_data: Attribute.JSON;
    previous: Attribute.Text;
    publishedAt: Attribute.DateTime;
    type: Attribute.Enumeration<
      [
        'question',
        'followup',
        'reply',
        'notification',
        'complete',
        'registration',
        'error'
      ]
    >;
    updatedAt: Attribute.DateTime;
    updatedBy: Attribute.Relation<
      'api::message.message',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    user: Attribute.Relation<
      'api::message.message',
      'oneToOne',
      'plugin::users-permissions.user'
    >;
  };
}

export interface ApiOrganizationOrganization extends Schema.CollectionType {
  collectionName: 'organizations';
  info: {
    description: '';
    displayName: 'Organization';
    pluralName: 'organizations';
    singularName: 'organization';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    createdAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::organization.organization',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    description: Attribute.Text;
    gardens: Attribute.Relation<
      'api::organization.organization',
      'oneToMany',
      'api::garden.garden'
    >;
    logo: Attribute.Media<'images' | 'files' | 'videos' | 'audios'>;
    publishedAt: Attribute.DateTime;
    title: Attribute.String;
    updatedAt: Attribute.DateTime;
    updatedBy: Attribute.Relation<
      'api::organization.organization',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    url: Attribute.String;
  };
}

export interface ApiPlantPlant extends Schema.CollectionType {
  collectionName: 'plants';
  info: {
    description: '';
    displayName: 'Plant';
    pluralName: 'plants';
    singularName: 'plant';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    Benefits: Attribute.Component<'plants.benefits', true>;
    createdAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::plant.plant',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    description: Attribute.Text;
    images: Attribute.Media<'images' | 'files' | 'videos' | 'audios', true>;
    latin: Attribute.String;
    magic: Attribute.RichText;
    publishedAt: Attribute.DateTime;
    slug: Attribute.String;
    sun_detail: Attribute.Text;
    title: Attribute.String;
    type: Attribute.Enumeration<
      ['annual', 'perennial', 'herb', 'tree', 'shrub']
    >;
    updatedAt: Attribute.DateTime;
    updatedBy: Attribute.Relation<
      'api::plant.plant',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    water_detail: Attribute.Text;
  };
}

export interface ApiRecurringTaskRecurringTask extends Schema.CollectionType {
  collectionName: 'recurring_tasks';
  info: {
    description: '';
    displayName: 'Recurring Task';
    pluralName: 'recurring-tasks';
    singularName: 'recurring-task';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    complete_once: Attribute.Boolean & Attribute.DefaultTo<true>;
    createdAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::recurring-task.recurring-task',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    garden: Attribute.Relation<
      'api::recurring-task.recurring-task',
      'manyToOne',
      'api::garden.garden'
    >;
    instruction: Attribute.Relation<
      'api::recurring-task.recurring-task',
      'oneToOne',
      'api::instruction.instruction'
    >;
    max_volunteers: Attribute.Integer;
    overview: Attribute.Text;
    primary_image: Attribute.Media<'images' | 'files' | 'videos' | 'audios'>;
    publishedAt: Attribute.DateTime;
    scheduler_type: Attribute.Enumeration<
      ['No Schedule', 'Daily Primary', 'Weekly Shuffle']
    > &
      Attribute.Required &
      Attribute.DefaultTo<'No Schedule'>;
    schedulers: Attribute.Relation<
      'api::recurring-task.recurring-task',
      'oneToMany',
      'api::scheduler.scheduler'
    >;
    title: Attribute.String;
    type: Attribute.Enumeration<
      ['General', 'Water', 'Weeding', 'Planting', 'Harvest']
    >;
    updatedAt: Attribute.DateTime;
    updatedBy: Attribute.Relation<
      'api::recurring-task.recurring-task',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    week_start_date: Attribute.Enumeration<
      [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday'
      ]
    > &
      Attribute.DefaultTo<'Sunday'>;
  };
}

export interface ApiSchedulerScheduler extends Schema.CollectionType {
  collectionName: 'schedulers';
  info: {
    description: '';
    displayName: 'Scheduler';
    pluralName: 'schedulers';
    singularName: 'scheduler';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    backup_volunteers: Attribute.Relation<
      'api::scheduler.scheduler',
      'oneToMany',
      'plugin::users-permissions.user'
    >;
    createdAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::scheduler.scheduler',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    day: Attribute.Enumeration<
      [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday'
      ]
    >;
    garden: Attribute.Relation<
      'api::scheduler.scheduler',
      'oneToOne',
      'api::garden.garden'
    >;
    publishedAt: Attribute.DateTime;
    recurring_task: Attribute.Relation<
      'api::scheduler.scheduler',
      'manyToOne',
      'api::recurring-task.recurring-task'
    >;
    updatedAt: Attribute.DateTime;
    updatedBy: Attribute.Relation<
      'api::scheduler.scheduler',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    volunteer: Attribute.Relation<
      'api::scheduler.scheduler',
      'oneToOne',
      'plugin::users-permissions.user'
    >;
  };
}

export interface ApiSmsCampaignSmsCampaign extends Schema.CollectionType {
  collectionName: 'sms_campaigns';
  info: {
    description: '';
    displayName: 'SMS Campaign';
    pluralName: 'sms-campaigns';
    singularName: 'sms-campaign';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    alert: Attribute.Boolean;
    body: Attribute.Text;
    confirmed: Attribute.Relation<
      'api::sms-campaign.sms-campaign',
      'oneToMany',
      'plugin::users-permissions.user'
    >;
    createdAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::sms-campaign.sms-campaign',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    denied: Attribute.Relation<
      'api::sms-campaign.sms-campaign',
      'oneToMany',
      'plugin::users-permissions.user'
    >;
    garden: Attribute.Relation<
      'api::sms-campaign.sms-campaign',
      'oneToOne',
      'api::garden.garden'
    >;
    publishedAt: Attribute.DateTime;
    sender: Attribute.Relation<
      'api::sms-campaign.sms-campaign',
      'oneToOne',
      'plugin::users-permissions.user'
    >;
    sent: Attribute.Relation<
      'api::sms-campaign.sms-campaign',
      'oneToMany',
      'plugin::users-permissions.user'
    >;
    type: Attribute.Enumeration<
      ['basic', 'rsvp', 'survey', 'volunteer-day', 'recurring-task']
    >;
    updatedAt: Attribute.DateTime;
    updatedBy: Attribute.Relation<
      'api::sms-campaign.sms-campaign',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    volunteer_day: Attribute.Relation<
      'api::sms-campaign.sms-campaign',
      'manyToOne',
      'api::volunteer-day.volunteer-day'
    >;
  };
}

export interface ApiUserGardenInterestUserGardenInterest
  extends Schema.CollectionType {
  collectionName: 'user_garden_interests';
  info: {
    description: '';
    displayName: 'User Garden Interest';
    pluralName: 'user-garden-interests';
    singularName: 'user-garden-interest';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    createdAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::user-garden-interest.user-garden-interest',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    garden: Attribute.Relation<
      'api::user-garden-interest.user-garden-interest',
      'oneToOne',
      'api::garden.garden'
    >;
    interest: Attribute.Relation<
      'api::user-garden-interest.user-garden-interest',
      'oneToOne',
      'api::interest.interest'
    >;
    publishedAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    updatedBy: Attribute.Relation<
      'api::user-garden-interest.user-garden-interest',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    user: Attribute.Relation<
      'api::user-garden-interest.user-garden-interest',
      'manyToOne',
      'plugin::users-permissions.user'
    >;
  };
}

export interface ApiVolunteerDayVolunteerDay extends Schema.CollectionType {
  collectionName: 'volunteer_days';
  info: {
    description: '';
    displayName: 'Volunteer Day';
    pluralName: 'volunteer-days';
    singularName: 'volunteer-day';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    accessibility: Attribute.Enumeration<
      ['Public', 'Garden Members', 'Invite Only']
    > &
      Attribute.DefaultTo<'Public'>;
    blurb: Attribute.Text;
    confirmed: Attribute.Relation<
      'api::volunteer-day.volunteer-day',
      'oneToMany',
      'plugin::users-permissions.user'
    >;
    content: Attribute.RichText;
    createdAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::volunteer-day.volunteer-day',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    disabled: Attribute.Boolean &
      Attribute.Required &
      Attribute.DefaultTo<false>;
    endText: Attribute.String;
    garden: Attribute.Relation<
      'api::volunteer-day.volunteer-day',
      'oneToOne',
      'api::garden.garden'
    >;
    garden_tasks: Attribute.Relation<
      'api::volunteer-day.volunteer-day',
      'oneToMany',
      'api::garden-task.garden-task'
    >;
    hero_image: Attribute.Media<'images' | 'files' | 'videos' | 'audios'>;
    interest: Attribute.String & Attribute.DefaultTo<'Everyone'>;
    messages: Attribute.Relation<
      'api::volunteer-day.volunteer-day',
      'oneToMany',
      'api::message.message'
    >;
    planting: Attribute.Component<'plants.planting', true>;
    publishedAt: Attribute.DateTime;
    slug: Attribute.String;
    sms_campaigns: Attribute.Relation<
      'api::volunteer-day.volunteer-day',
      'oneToMany',
      'api::sms-campaign.sms-campaign'
    >;
    smsLink: Attribute.Boolean;
    startDatetime: Attribute.DateTime;
    title: Attribute.String;
    updatedAt: Attribute.DateTime;
    updatedBy: Attribute.Relation<
      'api::volunteer-day.volunteer-day',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface ApiWeatherWeather extends Schema.CollectionType {
  collectionName: 'weathers';
  info: {
    displayName: 'Weather';
    pluralName: 'weathers';
    singularName: 'weather';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    createdAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::weather.weather',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    date: Attribute.DateTime;
    description: Attribute.Text;
    dt: Attribute.Integer;
    json: Attribute.JSON;
    openweather_id: Attribute.Integer;
    publishedAt: Attribute.DateTime;
    temp_max: Attribute.Decimal;
    temp_min: Attribute.Decimal;
    updatedAt: Attribute.DateTime;
    updatedBy: Attribute.Relation<
      'api::weather.weather',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    weather_title: Attribute.Enumeration<['Mist', 'Rain', 'Clear', 'Clouds']>;
  };
}

export interface ApiWeeklyScheduleWeeklySchedule extends Schema.CollectionType {
  collectionName: 'weekly_schedules';
  info: {
    description: '';
    displayName: 'Weekly Schedule';
    pluralName: 'weekly-schedules';
    singularName: 'weekly-schedule';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    assignees: Attribute.Component<'scheduling.schedule-assignee', true>;
    createdAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::weekly-schedule.weekly-schedule',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    publishedAt: Attribute.DateTime;
    recurring_task: Attribute.Relation<
      'api::weekly-schedule.weekly-schedule',
      'oneToOne',
      'api::recurring-task.recurring-task'
    >;
    updatedAt: Attribute.DateTime;
    updatedBy: Attribute.Relation<
      'api::weekly-schedule.weekly-schedule',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    Week: Attribute.String;
  };
}

export interface PluginContentReleasesRelease extends Schema.CollectionType {
  collectionName: 'strapi_releases';
  info: {
    displayName: 'Release';
    pluralName: 'releases';
    singularName: 'release';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    actions: Attribute.Relation<
      'plugin::content-releases.release',
      'oneToMany',
      'plugin::content-releases.release-action'
    >;
    createdAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'plugin::content-releases.release',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    name: Attribute.String & Attribute.Required;
    releasedAt: Attribute.DateTime;
    scheduledAt: Attribute.DateTime;
    status: Attribute.Enumeration<
      ['ready', 'blocked', 'failed', 'done', 'empty']
    > &
      Attribute.Required;
    timezone: Attribute.String;
    updatedAt: Attribute.DateTime;
    updatedBy: Attribute.Relation<
      'plugin::content-releases.release',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface PluginContentReleasesReleaseAction
  extends Schema.CollectionType {
  collectionName: 'strapi_release_actions';
  info: {
    displayName: 'Release Action';
    pluralName: 'release-actions';
    singularName: 'release-action';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    contentType: Attribute.String & Attribute.Required;
    createdAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'plugin::content-releases.release-action',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    entry: Attribute.Relation<
      'plugin::content-releases.release-action',
      'morphToOne'
    >;
    isEntryValid: Attribute.Boolean;
    locale: Attribute.String;
    release: Attribute.Relation<
      'plugin::content-releases.release-action',
      'manyToOne',
      'plugin::content-releases.release'
    >;
    type: Attribute.Enumeration<['publish', 'unpublish']> & Attribute.Required;
    updatedAt: Attribute.DateTime;
    updatedBy: Attribute.Relation<
      'plugin::content-releases.release-action',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface PluginI18NLocale extends Schema.CollectionType {
  collectionName: 'i18n_locale';
  info: {
    collectionName: 'locales';
    description: '';
    displayName: 'Locale';
    pluralName: 'locales';
    singularName: 'locale';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    code: Attribute.String & Attribute.Unique;
    createdAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'plugin::i18n.locale',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    name: Attribute.String &
      Attribute.SetMinMax<
        {
          max: 50;
          min: 1;
        },
        number
      >;
    updatedAt: Attribute.DateTime;
    updatedBy: Attribute.Relation<
      'plugin::i18n.locale',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface PluginSlugifySlug extends Schema.CollectionType {
  collectionName: 'slugs';
  info: {
    displayName: 'slug';
    pluralName: 'slugs';
    singularName: 'slug';
  };
  options: {
    comment: '';
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    count: Attribute.Integer;
    createdAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'plugin::slugify.slug',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    slug: Attribute.Text;
    updatedAt: Attribute.DateTime;
    updatedBy: Attribute.Relation<
      'plugin::slugify.slug',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface PluginUploadFile extends Schema.CollectionType {
  collectionName: 'files';
  info: {
    description: '';
    displayName: 'File';
    pluralName: 'files';
    singularName: 'file';
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    alternativeText: Attribute.String;
    caption: Attribute.String;
    createdAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'plugin::upload.file',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    ext: Attribute.String;
    folder: Attribute.Relation<
      'plugin::upload.file',
      'manyToOne',
      'plugin::upload.folder'
    > &
      Attribute.Private;
    folderPath: Attribute.String &
      Attribute.Required &
      Attribute.Private &
      Attribute.SetMinMax<
        {
          min: 1;
        },
        number
      >;
    formats: Attribute.JSON;
    hash: Attribute.String & Attribute.Required;
    height: Attribute.Integer;
    mime: Attribute.String & Attribute.Required;
    name: Attribute.String & Attribute.Required;
    previewUrl: Attribute.String;
    provider: Attribute.String & Attribute.Required;
    provider_metadata: Attribute.JSON;
    related: Attribute.Relation<'plugin::upload.file', 'morphToMany'>;
    size: Attribute.Decimal & Attribute.Required;
    updatedAt: Attribute.DateTime;
    updatedBy: Attribute.Relation<
      'plugin::upload.file',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    url: Attribute.String & Attribute.Required;
    width: Attribute.Integer;
  };
}

export interface PluginUploadFolder extends Schema.CollectionType {
  collectionName: 'upload_folders';
  info: {
    displayName: 'Folder';
    pluralName: 'folders';
    singularName: 'folder';
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    children: Attribute.Relation<
      'plugin::upload.folder',
      'oneToMany',
      'plugin::upload.folder'
    >;
    createdAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'plugin::upload.folder',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    files: Attribute.Relation<
      'plugin::upload.folder',
      'oneToMany',
      'plugin::upload.file'
    >;
    name: Attribute.String &
      Attribute.Required &
      Attribute.SetMinMax<
        {
          min: 1;
        },
        number
      >;
    parent: Attribute.Relation<
      'plugin::upload.folder',
      'manyToOne',
      'plugin::upload.folder'
    >;
    path: Attribute.String &
      Attribute.Required &
      Attribute.SetMinMax<
        {
          min: 1;
        },
        number
      >;
    pathId: Attribute.Integer & Attribute.Required & Attribute.Unique;
    updatedAt: Attribute.DateTime;
    updatedBy: Attribute.Relation<
      'plugin::upload.folder',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface PluginUsersPermissionsPermission
  extends Schema.CollectionType {
  collectionName: 'up_permissions';
  info: {
    description: '';
    displayName: 'Permission';
    name: 'permission';
    pluralName: 'permissions';
    singularName: 'permission';
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    action: Attribute.String & Attribute.Required;
    createdAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'plugin::users-permissions.permission',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    role: Attribute.Relation<
      'plugin::users-permissions.permission',
      'manyToOne',
      'plugin::users-permissions.role'
    >;
    updatedAt: Attribute.DateTime;
    updatedBy: Attribute.Relation<
      'plugin::users-permissions.permission',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface PluginUsersPermissionsRole extends Schema.CollectionType {
  collectionName: 'up_roles';
  info: {
    description: '';
    displayName: 'Role';
    name: 'role';
    pluralName: 'roles';
    singularName: 'role';
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    createdAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'plugin::users-permissions.role',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    description: Attribute.String;
    name: Attribute.String &
      Attribute.Required &
      Attribute.SetMinMaxLength<{
        minLength: 3;
      }>;
    permissions: Attribute.Relation<
      'plugin::users-permissions.role',
      'oneToMany',
      'plugin::users-permissions.permission'
    >;
    type: Attribute.String & Attribute.Unique;
    updatedAt: Attribute.DateTime;
    updatedBy: Attribute.Relation<
      'plugin::users-permissions.role',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    users: Attribute.Relation<
      'plugin::users-permissions.role',
      'oneToMany',
      'plugin::users-permissions.user'
    >;
  };
}

export interface PluginUsersPermissionsUser extends Schema.CollectionType {
  collectionName: 'up_users';
  info: {
    description: '';
    displayName: 'User';
    name: 'user';
    pluralName: 'users';
    singularName: 'user';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    activeGarden: Attribute.Relation<
      'plugin::users-permissions.user',
      'oneToOne',
      'api::garden.garden'
    >;
    bio: Attribute.Text;
    blocked: Attribute.Boolean & Attribute.DefaultTo<false>;
    chatId: Attribute.BigInteger;
    color: Attribute.Enumeration<
      [
        'yellow',
        'orange',
        'green',
        'emerald',
        'lime',
        'blue',
        'indigo',
        'violet',
        'fuchsia',
        'purple',
        'slate'
      ]
    >;
    confirmationToken: Attribute.String & Attribute.Private;
    confirmed: Attribute.Boolean & Attribute.DefaultTo<false>;
    createdAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'plugin::users-permissions.user',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    email: Attribute.Email &
      Attribute.Required &
      Attribute.SetMinMaxLength<{
        minLength: 6;
      }>;
    firstName: Attribute.String;
    gardens: Attribute.Relation<
      'plugin::users-permissions.user',
      'manyToMany',
      'api::garden.garden'
    >;
    instructions: Attribute.Relation<
      'plugin::users-permissions.user',
      'oneToMany',
      'api::instruction.instruction'
    >;
    lastName: Attribute.String;
    password: Attribute.Password &
      Attribute.Private &
      Attribute.SetMinMaxLength<{
        minLength: 6;
      }>;
    paused: Attribute.Boolean & Attribute.DefaultTo<false>;
    phoneNumber: Attribute.String;
    profilePhoto: Attribute.Media<'images' | 'files' | 'videos' | 'audios'>;
    provider: Attribute.String;
    resetPasswordToken: Attribute.String & Attribute.Private;
    role: Attribute.Relation<
      'plugin::users-permissions.user',
      'manyToOne',
      'plugin::users-permissions.role'
    >;
    status: Attribute.Enumeration<
      ['INTERESTED', 'VOLUNTEER', 'PROFESSIONAL', 'INACTIVE']
    >;
    u_g_interests: Attribute.Relation<
      'plugin::users-permissions.user',
      'oneToMany',
      'api::user-garden-interest.user-garden-interest'
    >;
    updatedAt: Attribute.DateTime;
    updatedBy: Attribute.Relation<
      'plugin::users-permissions.user',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    username: Attribute.String &
      Attribute.Required &
      Attribute.Unique &
      Attribute.SetMinMaxLength<{
        minLength: 3;
      }>;
  };
}

declare module '@strapi/types' {
  export module Shared {
    export interface ContentTypes {
      'admin::api-token': AdminApiToken;
      'admin::api-token-permission': AdminApiTokenPermission;
      'admin::permission': AdminPermission;
      'admin::role': AdminRole;
      'admin::transfer-token': AdminTransferToken;
      'admin::transfer-token-permission': AdminTransferTokenPermission;
      'admin::user': AdminUser;
      'api::application.application': ApiApplicationApplication;
      'api::blog.blog': ApiBlogBlog;
      'api::category.category': ApiCategoryCategory;
      'api::garden-task.garden-task': ApiGardenTaskGardenTask;
      'api::garden.garden': ApiGardenGarden;
      'api::instruction.instruction': ApiInstructionInstruction;
      'api::interest.interest': ApiInterestInterest;
      'api::location-tracking.location-tracking': ApiLocationTrackingLocationTracking;
      'api::message.message': ApiMessageMessage;
      'api::organization.organization': ApiOrganizationOrganization;
      'api::plant.plant': ApiPlantPlant;
      'api::recurring-task.recurring-task': ApiRecurringTaskRecurringTask;
      'api::scheduler.scheduler': ApiSchedulerScheduler;
      'api::sms-campaign.sms-campaign': ApiSmsCampaignSmsCampaign;
      'api::user-garden-interest.user-garden-interest': ApiUserGardenInterestUserGardenInterest;
      'api::volunteer-day.volunteer-day': ApiVolunteerDayVolunteerDay;
      'api::weather.weather': ApiWeatherWeather;
      'api::weekly-schedule.weekly-schedule': ApiWeeklyScheduleWeeklySchedule;
      'plugin::content-releases.release': PluginContentReleasesRelease;
      'plugin::content-releases.release-action': PluginContentReleasesReleaseAction;
      'plugin::i18n.locale': PluginI18NLocale;
      'plugin::slugify.slug': PluginSlugifySlug;
      'plugin::upload.file': PluginUploadFile;
      'plugin::upload.folder': PluginUploadFolder;
      'plugin::users-permissions.permission': PluginUsersPermissionsPermission;
      'plugin::users-permissions.role': PluginUsersPermissionsRole;
      'plugin::users-permissions.user': PluginUsersPermissionsUser;
    }
  }
}
