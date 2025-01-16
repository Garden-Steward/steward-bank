import type { Schema, Attribute } from '@strapi/strapi';

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

export interface EducationCard extends Schema.Component {
  collectionName: 'components_education_cards';
  info: {
    displayName: 'Card';
    icon: 'store';
    description: '';
  };
  attributes: {
    content: Attribute.Blocks;
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

declare module '@strapi/types' {
  export module Shared {
    export interface Components {
      'scheduling.schedule-assignee': SchedulingScheduleAssignee;
      'education.card': EducationCard;
      'seo.seo-information': SeoSeoInformation;
      'plants.planting': PlantsPlanting;
      'plants.benefits': PlantsBenefits;
    }
  }
}
