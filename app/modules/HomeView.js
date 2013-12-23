define([
  'underscore',
  'jquery',
  'backbone',
  'modules/CharacterCollection',
  'text!templates/home'
], function(_, $, Backbone, CharacterCollection, HomeTemplate) {
  var HomeView = Backbone.View.extend({
    tagName: 'ul',

    className: 'thumbnails',

    template: _.template(HomeTemplate),

    initialize: function() {
      _.bindAll(this, 'vote');
      this.collection.on('change:wins', this.vote, this);
    },

    render: function() {
      this.$el.html(this.template());
      this.collection.each(this.addOne, this);
      return this;
    },

    vote: function(winner) {
      var loser = this.collection.at(Math.abs(1 - this.collection.indexOf(winner)));
      loser.set('losses', loser.get('losses') + 1);
      // TODO: remove self, test if it still works
      var self = this;
      $.ajax({
        url: '/api/characters',
        type: 'PUT',
        data: {
          winner: winner.get('characterId'),
          loser: loser.get('characterId')
        },
        // TODO: Error handler
        success: function() {
          self.collection.fetch({
            url: '/api/characters',
            success: function(data) {
              if (data.length < 2) {
                self.$el.html('<div class="alert alert-info">Nothing to display</div>');
              } else {
                self.render();
              }
            }
          });
        }
      });
    },

    addOne: function(character, index) {
      var characterThumbnailView = new App.Views.CharacterThumbnail({ model: character });
      this.$el.append(characterThumbnailView.render().el);
    },

    selectMenuItem: function(menuItem) {
      $('.navbar .nav li').removeClass('active');
      if (menuItem) {
        $('.' + menuItem).addClass('active');
      }
    }
  });

  return HomeView;
});
