// Copyright (c) IPython Development Team.
// Distributed under the terms of the Modified BSD License.

define([
    'base/js/namespace',
    'jquery',
    'base/js/utils',
    'base/js/dialog',
    'base/js/keyboard',
    'moment',
], function(IPython, $, utils, dialog, keyboard, moment) {
    "use strict";

    var SaveWidget = function (selector, options) {
        // TODO: Remove circular ref.
        this.notebook = undefined;
        this.selector = selector;
        this.events = options.events;
        this._checkpoint_date = undefined;
        this.keyboard_manager = options.keyboard_manager;
        if (this.selector !== undefined) {
            this.element = $(selector);
            this.bind_events();
        }
    };


    SaveWidget.prototype.bind_events = function () {
        var that = this;
        this.element.find('span#notebook_name').click(function () {
            that.rename_notebook();
        });
        this.events.on('notebook_loaded.Notebook', function () {
            that.update_notebook_name();
            that.update_document_title();
        });
        this.events.on('notebook_saved.Notebook', function () {
            that.update_notebook_name();
            that.update_document_title();
        });
        this.events.on('notebook_renamed.Notebook', function () {
            that.update_notebook_name();
            that.update_document_title();
            that.update_address_bar();
        });
        this.events.on('notebook_save_failed.Notebook', function () {
            that.set_save_status('Autosave Failed!');
        });
        this.events.on('checkpoints_listed.Notebook', function (event, data) {
            that._set_last_checkpoint(data[0]);
        });

        this.events.on('checkpoint_created.Notebook', function (event, data) {
            that._set_last_checkpoint(data);
        });
        this.events.on('set_dirty.Notebook', function (event, data) {
            that.set_autosaved(data.value);
        });
    };


    SaveWidget.prototype.rename_notebook = function (options) {
        options = options || {};
        var that = this;
        var dialog_body = $('<div/>').append(
            $("<p/>").addClass("rename-message")
                .text('Enter a new notebook name:')
        ).append(
            $("<br/>")
        ).append(
            $('<input/>').attr('type','text').attr('size','25').addClass('form-control')
            .val(that.notebook.get_notebook_name())
        );
        dialog.modal({
            title: "Rename Notebook",
            body: dialog_body,
            notebook: options.notebook,
            keyboard_manager: this.keyboard_manager,
            buttons : {
                "OK": {
                    class: "btn-primary",
                    click: function () {
                    var new_name = $(this).find('input').val();
                    if (!that.notebook.test_notebook_name(new_name)) {
                        $(this).find('.rename-message').text(
                            "Invalid notebook name. Notebook names must "+
                            "have 1 or more characters and can contain any characters " +
                            "except :/\\. Please enter a new notebook name:"
                        );
                        return false;
                    } else {
                        that.notebook.rename(new_name);
                    }
                }},
                "Cancel": {}
                },
            open : function (event, ui) {
                var that = $(this);
                // Upon ENTER, click the OK button.
                that.find('input[type="text"]').keydown(function (event, ui) {
                    if (event.which === keyboard.keycodes.enter) {
                        that.find('.btn-primary').first().click();
                        return false;
                    }
                });
                that.find('input[type="text"]').focus().select();
            }
        });
    };


    SaveWidget.prototype.update_notebook_name = function () {
        var nbname = this.notebook.get_notebook_name();
        this.element.find('span#notebook_name').text(nbname);
    };


    SaveWidget.prototype.update_document_title = function () {
        var nbname = this.notebook.get_notebook_name();
        document.title = nbname;
    };

    SaveWidget.prototype.update_address_bar = function(){
        var base_url = this.notebook.base_url;
        var path = this.notebook.notebook_path;
        var state = {path : path};
        window.history.replaceState(state, "", utils.url_join_encode(
            base_url,
            "notebooks",
            path)
        );
    };


    SaveWidget.prototype.set_save_status = function (msg) {
        this.element.find('span#autosave_status').text(msg);
    };

    SaveWidget.prototype._set_checkpoint_status = function (human_date, iso_date) {
        var el = this.element.find('span#checkpoint_status');
        if(human_date){
            el.text("Last Checkpoint: "+human_date).attr('title',iso_date);
        } else {
            el.text('').attr('title', 'no-checkpoint');
        }
    };

    // compute (roughly) the remaining time in millisecond until the next
    // moment.js relative time update of the string, which by default 
    // happend at 
    //  (a few seconds ago) 
    //  - 45sec, 
    //  (a minute ago) 
    //  - 90sec,
    //      ( x minutes ago) 
    //      - then every minutes until
    //  - 45 min,
    //      (an hour ago) 
    //  - 1h45, 
    //      (x hours ago )
    //      - then every hours
    //  - 22 hours ago
    var _next_timeago_update = function(deltatime_ms){
        var s = 1000; 
        var m = 60*s;
        var h = 60*m;

        var mtt = moment.relativeTimeThreshold;

        if(deltatime_ms < mtt.s*s){
            return mtt.s*s-deltatime_ms;
        } else if (deltatime_ms < (mtt.s*s+m)) {
            return (mtt.s*s+m)-deltatime_ms;
        } else if (deltatime_ms < mtt.m*m){
            return m;
        } else if (deltatime_ms < (mtt.m*m+h)){
            return (mtt.m*m+h)-deltatime_ms;
        } else  {
            return h;
        }
    };

    SaveWidget.prototype._regularly_update_checkpoint_date = function(){
       if (!this._checkpoint_date) {
            this._set_checkpoint_status(null);
            console.log('no checkpoint done');
            return;
        }
        var chkd = moment(this._checkpoint_date);
        var longdate = chkd.format('llll');

        var that = this;
        var recall  = function(t){
            // recall slightly later (1s) as long timeout in js might be imprecise,
            // and you want to be call **after** the change of formatting should happend.
            return setTimeout(
                $.proxy(that._regularly_update_checkpoint_date, that),
                t + 1000
            );
        };
        var tdelta = Math.ceil(new Date()-this._checkpoint_date);

        // update regularly for the first 6hours and show
        // <x time> ago
        if(tdelta < tdelta < 6*3600*1000){  
            recall(_next_timeago_update(tdelta));
            this._set_checkpoint_status(chkd.fromNow(), longdate);
        // otherwise update every hour and show
        // <Today | yesterday|...> at hh,mm,ss
        } else  {
            recall(1*3600*1000);
            this._set_checkpoint_status(chkd.calendar(), longdate);
        }
    };

    SaveWidget.prototype._set_last_checkpoint = function (checkpoint) {
        if (checkpoint) {
            this._checkpoint_date = new Date(checkpoint.last_modified);
        } else {
            this._checkpoint_date = null;
        }
        this._regularly_update_checkpoint_date();

    };

    SaveWidget.prototype.set_autosaved = function (dirty) {
        if (dirty) {
            this.set_save_status("(unsaved changes)");
        } else {
            this.set_save_status("(autosaved)");
        }
    };

    // Backwards compatibility.
    IPython.SaveWidget = SaveWidget;

    return {'SaveWidget': SaveWidget};

});
