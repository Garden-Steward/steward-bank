import type { Schema, Attribute } from '@strapi/strapi';

export interface PlantsBenefits extends Schema.Component {
  collectionName: 'components_plants_benefits';
  info: {
    displayName: 'Benefits';
    icon: 'handHeart';
    description: '';
  };
  attributes: {
    title: Attribute.String;
    potency: Attribute.Enumeration<
      ['minimal', 'mild', 'moderate', 'strong', 'profound']
    >;
  };
}

export interface PlantsPlanting extends Schema.Component {
  collectionName: 'components_plants_plantings';
  info: {
    displayName: 'planting';
    icon: 'seed';
  };
  attributes: {
    plant_name: Attribute.String;
  };
}

export interface SchedulingScheduleAssignee extends Schema.Component {
  collectionName: 'components_scheduling_schedule_assignees';
  info: {
    displayName: 'Schedule Assignee';
  };
  attributes: {
    assignee: Attribute.Relation<
      'scheduling.schedule-assignee',
      'oneToOne',
      'plugin::users-permissions.user'
    >;
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
  };
}

export interface SeoSeoInformation extends Schema.Component {
  collectionName: 'components_seo_seo_informations';
  info: {
    displayName: 'SeoInformation';
    icon: 'collapse';
    description: '';
  };
  attributes: {
    seotitle: Attribute.String;
    seodescription: Attribute.Text;
  };
}

declare module '@strapi/types' {
  export module Shared {
    export interface Components {
      'plants.benefits': PlantsBenefits;
      'plants.planting': PlantsPlanting;
      'scheduling.schedule-assignee': SchedulingScheduleAssignee;
      'seo.seo-information': SeoSeoInformation;
    }
  }
}
