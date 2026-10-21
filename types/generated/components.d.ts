import type { Schema, Struct } from '@strapi/strapi';

export interface ChecklistStandingTask extends Struct.ComponentSchema {
  collectionName: 'components_checklist_standing_tasks';
  info: {
    description: 'One line on the every-workday checklist';
    displayName: 'Standing Task';
  };
  attributes: {
    note: Schema.Attribute.Text;
    title: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface EducationCard extends Struct.ComponentSchema {
  collectionName: 'components_education_cards';
  info: {
    description: '';
    displayName: 'Card';
    icon: 'store';
  };
  attributes: {
    content: Schema.Attribute.Blocks;
  };
}

export interface EventsAgendaItem extends Struct.ComponentSchema {
  collectionName: 'components_events_agenda_items';
  info: {
    description: 'One step in how an event day goes';
    displayName: 'Agenda Item';
  };
  attributes: {
    detail: Schema.Attribute.String;
    label: Schema.Attribute.String & Schema.Attribute.Required;
    time_text: Schema.Attribute.String;
  };
}

export interface EventsBrief extends Struct.ComponentSchema {
  collectionName: 'components_events_briefs';
  info: {
    description: "What to expect at an event: schedule, what to bring, who it's for";
    displayName: 'Event Brief';
  };
  attributes: {
    agenda: Schema.Attribute.Component<'events.agenda-item', true>;
    bring_items: Schema.Attribute.Component<'events.bring-item', true>;
    duration_text: Schema.Attribute.String;
    food: Schema.Attribute.String;
    good_for: Schema.Attribute.String;
    what_to_expect: Schema.Attribute.Text;
  };
}

export interface EventsBringItem extends Struct.ComponentSchema {
  collectionName: 'components_events_bring_items';
  info: {
    description: 'Something to bring, and who brings it';
    displayName: 'Bring Item';
  };
  attributes: {
    label: Schema.Attribute.String & Schema.Attribute.Required;
    provided_by: Schema.Attribute.Enumeration<['volunteer', 'garden']> &
      Schema.Attribute.DefaultTo<'volunteer'>;
  };
}

export interface GardenVisitInfo extends Struct.ComponentSchema {
  collectionName: 'components_garden_visit_infos';
  info: {
    description: 'Logistics true of every visit to a garden, shown on all of its events';
    displayName: 'Visit Info';
  };
  attributes: {
    accessibility: Schema.Attribute.Text;
    kids_pets: Schema.Attribute.Text;
    meeting_note: Schema.Attribute.Text;
    meeting_spot: Schema.Attribute.String;
    parking_transit: Schema.Attribute.Text;
    restroom: Schema.Attribute.Text;
  };
}

export interface PlantsBenefits extends Struct.ComponentSchema {
  collectionName: 'components_plants_benefits';
  info: {
    description: '';
    displayName: 'Benefits';
    icon: 'handHeart';
  };
  attributes: {
    potency: Schema.Attribute.Enumeration<
      ['minimal', 'mild', 'moderate', 'strong', 'profound']
    >;
    source_type: Schema.Attribute.JSON;
    title: Schema.Attribute.String;
  };
}

export interface PlantsPlanting extends Struct.ComponentSchema {
  collectionName: 'components_plants_plantings';
  info: {
    displayName: 'planting';
    icon: 'seed';
  };
  attributes: {
    plant_name: Schema.Attribute.String;
  };
}

export interface PlantsSources extends Struct.ComponentSchema {
  collectionName: 'components_plants_sources';
  info: {
    description: 'References and sources cited for plant data';
    displayName: 'Sources';
    icon: 'bookOpen';
  };
  attributes: {
    author: Schema.Attribute.String;
    title: Schema.Attribute.String & Schema.Attribute.Required;
    type: Schema.Attribute.Enumeration<
      [
        'website',
        'book',
        'academic-paper',
        'indigenous-knowledge',
        'garden-observation',
        'blog',
        'other',
      ]
    >;
    url: Schema.Attribute.String;
  };
}

export interface ProjectsImpactMetric extends Struct.ComponentSchema {
  collectionName: 'components_projects_impact_metrics';
  info: {
    description: 'Measurable impact from a project';
    displayName: 'Impact Metric';
  };
  attributes: {
    icon: Schema.Attribute.String;
    label: Schema.Attribute.String & Schema.Attribute.Required;
    value: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface SchedulingScheduleAssignee extends Struct.ComponentSchema {
  collectionName: 'components_scheduling_schedule_assignees';
  info: {
    displayName: 'Schedule Assignee';
  };
  attributes: {
    assignee: Schema.Attribute.Relation<
      'oneToOne',
      'plugin::users-permissions.user'
    >;
    day: Schema.Attribute.Enumeration<
      [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ]
    >;
  };
}

export interface SeoSeoInformation extends Struct.ComponentSchema {
  collectionName: 'components_seo_seo_informations';
  info: {
    description: '';
    displayName: 'SeoInformation';
    icon: 'collapse';
  };
  attributes: {
    seodescription: Schema.Attribute.Text;
    seotitle: Schema.Attribute.String;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'checklist.standing-task': ChecklistStandingTask;
      'education.card': EducationCard;
      'events.agenda-item': EventsAgendaItem;
      'events.brief': EventsBrief;
      'events.bring-item': EventsBringItem;
      'garden.visit-info': GardenVisitInfo;
      'plants.benefits': PlantsBenefits;
      'plants.planting': PlantsPlanting;
      'plants.sources': PlantsSources;
      'projects.impact-metric': ProjectsImpactMetric;
      'scheduling.schedule-assignee': SchedulingScheduleAssignee;
      'seo.seo-information': SeoSeoInformation;
    }
  }
}
