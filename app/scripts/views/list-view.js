import Backbone from 'backbone';
import { View } from 'framework/views/view';
import { EntryCollection } from 'collections/entry-collection';
import { DragDropInfo } from 'comp/app/drag-drop-info';
import { Alerts } from 'comp/ui/alerts';
import { AppSettingsModel } from 'models/app-settings-model';
import { EntryPresenter } from 'presenters/entry-presenter';
import { StringFormat } from 'util/formatting/string-format';
import { Locale } from 'util/locale';
import { Resizable } from 'framework/views/resizable';
import { Scrollable } from 'framework/views/scrollable';
import { DropdownView } from 'views/dropdown-view';
import { ListSearchView } from 'views/list-search-view';
import template from 'templates/list.hbs';
import emptyTemplate from 'templates/list-empty.hbs';

class ListView extends View {
    parent = '.app__list';

    template = template;

    emptyTemplate = emptyTemplate;

    events = {
        'click': 'click',
        'click .list__table-options': 'tableOptionsClick',
        'dragstart .list__item': 'itemDragStart'
    };

    minWidth = 200;
    minHeight = 200;
    maxWidth = 500;
    maxHeight = 500;

    itemsEl = null;

    tableColumns = [
        { val: 'title', name: 'title', enabled: true },
        { val: 'user', name: 'user', enabled: true },
        { val: 'url', name: 'website', enabled: true },
        { val: 'tags', name: 'tags', enabled: true },
        { val: 'notes', name: 'notes', enabled: true },
        { val: 'groupName', name: 'group', enabled: false },
        { val: 'fileName', name: 'file', enabled: false }
    ];

    constructor(model, options) {
        super(model, options);

        this.initScroll();
        this.views.search = new ListSearchView(this.model);

        this.listenTo(this.views.search, 'select-prev', this.selectPrev);
        this.listenTo(this.views.search, 'select-next', this.selectNext);
        this.listenTo(this.views.search, 'create-entry', this.createEntry);
        this.listenTo(this.views.search, 'create-group', this.createGroup);
        this.listenTo(this.views.search, 'create-template', this.createTemplate);
        this.listenTo(this, 'show', this.viewShown);
        this.listenTo(this, 'hide', this.viewHidden);
        this.listenTo(this, 'view-resize', this.viewResized);
        this.listenTo(Backbone, 'filter', this.filterChanged);
        this.listenTo(Backbone, 'entry-updated', this.entryUpdated);
        this.listenTo(Backbone, 'set-locale', this.render);

        this.listenTo(this.model.settings, 'change:tableView', this.setTableView);

        this.readTableColumnsEnabled();

        this.items = new EntryCollection();
    }

    render() {
        if (!this.itemsEl) {
            super.render();
            this.itemsEl = this.$el.find('.list__items>.scroller');
            this.views.search.render();
            this.setTableView();

            this.createScroll({
                root: this.$el.find('.list__items')[0],
                scroller: this.$el.find('.scroller')[0],
                bar: this.$el.find('.scroller__bar')[0]
            });
        }
        if (this.items.length) {
            const itemTemplate = this.getItemTemplate();
            const itemsTemplate = this.getItemsTemplate();
            const noColor = AppSettingsModel.instance.get('colorfulIcons') ? '' : 'grayscale';
            const presenter = new EntryPresenter(
                this.getDescField(),
                noColor,
                this.model.activeEntryId
            );
            const columns = {};
            this.tableColumns.forEach(col => {
                if (col.enabled) {
                    columns[col.val] = true;
                }
            });
            presenter.columns = columns;
            let itemsHtml = '';
            this.items.forEach(item => {
                presenter.present(item);
                itemsHtml += itemTemplate(presenter);
            }, this);
            const html = itemsTemplate({ items: itemsHtml, columns: this.tableColumns });
            this.itemsEl.html(html);
        } else {
            this.itemsEl.html(this.emptyTemplate());
        }
        this.pageResized();
    }

    getItemsTemplate() {
        if (this.model.settings.get('tableView')) {
            return require('templates/list-table.hbs');
        } else {
            return this.renderPlainItems;
        }
    }

    renderPlainItems(itemsHtml) {
        return itemsHtml.items;
    }

    getItemTemplate() {
        if (this.model.settings.get('tableView')) {
            return require('templates/list-item-table.hbs');
        } else {
            return require('templates/list-item-short.hbs');
        }
    }

    getDescField() {
        return this.model.sort.replace('-', '');
    }

    click(e) {
        const listItemEl = e.target.closest('.list__item');
        if (!listItemEl) {
            return;
        }
        const id = listItemEl.id;
        const item = this.items.get(id);
        if (!item.active) {
            this.selectItem(item);
        }
        Backbone.trigger('toggle-details', true);
    }

    selectPrev() {
        const ix = this.items.indexOf(this.items.get(this.model.activeEntryId));
        if (ix > 0) {
            this.selectItem(this.items.at(ix - 1));
        }
    }

    selectNext() {
        const ix = this.items.indexOf(this.items.get(this.model.activeEntryId));
        if (ix < this.items.length - 1) {
            this.selectItem(this.items.at(ix + 1));
        }
    }

    createEntry(arg) {
        const newEntry = this.model.createNewEntry(arg);
        this.items.unshift(newEntry);
        this.render();
        this.selectItem(newEntry);
    }

    createGroup() {
        const newGroup = this.model.createNewGroup();
        Backbone.trigger('edit-group', newGroup);
    }

    createTemplate() {
        if (!this.model.settings.get('templateHelpShown')) {
            Alerts.yesno({
                icon: 'sticky-note-o',
                header: Locale.listAddTemplateHeader,
                body:
                    Locale.listAddTemplateBody1.replace('{}', '<i class="fa fa-plus"></i>') +
                    '<br/>' +
                    Locale.listAddTemplateBody2.replace('{}', 'Templates'),
                buttons: [Alerts.buttons.ok, Alerts.buttons.cancel],
                success: () => {
                    this.model.settings.set('templateHelpShown', true);
                    this.createTemplate();
                }
            });
            return;
        }
        const templateEntry = this.model.createNewTemplateEntry();
        this.items.unshift(templateEntry);
        this.render();
        this.selectItem(templateEntry);
    }

    selectItem(item) {
        this.model.activeEntryId = item.id;
        Backbone.trigger('entry-selected', item);
        this.itemsEl.find('.list__item--active').removeClass('list__item--active');
        const itemEl = document.getElementById(item.id);
        itemEl.classList.add('list__item--active');
        const listEl = this.itemsEl[0];
        const itemRect = itemEl.getBoundingClientRect();
        const listRect = listEl.getBoundingClientRect();
        if (itemRect.top < listRect.top) {
            listEl.scrollTop += itemRect.top - listRect.top;
        } else if (itemRect.bottom > listRect.bottom) {
            listEl.scrollTop += itemRect.bottom - listRect.bottom;
        }
    }

    viewShown() {
        this.views.search.show();
    }

    viewHidden() {
        this.views.search.hide();
    }

    setTableView() {
        const isTable = this.model.settings.get('tableView');
        this.dragView.setCoord(isTable ? 'y' : 'x');
        this.setDefaultSize();
    }

    setDefaultSize() {
        this.setSize(this.model.settings.get('listViewWidth'));
    }

    setSize(size) {
        this.$el.css({ width: 'auto', height: 'auto' });
        if (size) {
            this.$el.css('flex', '0 0 ' + size + 'px');
        } else {
            this.$el.css('flex', null);
        }
    }

    viewResized(size) {
        this.setSize(size);
        this.throttleSetViewSizeSetting(size);
    }

    throttleSetViewSizeSetting = _.throttle(size => {
        AppSettingsModel.instance.set('listViewWidth', size);
    }, 1000);

    filterChanged(filter) {
        this.items = filter.entries;
        this.render();
    }

    entryUpdated() {
        const scrollTop = this.itemsEl[0].scrollTop;
        this.render();
        this.itemsEl[0].scrollTop = scrollTop;
    }

    itemDragStart(e) {
        e.stopPropagation();
        const id = $(e.target)
            .closest('.list__item')
            .attr('id');
        e.dataTransfer.setData('text/entry', id);
        e.dataTransfer.effectAllowed = 'move';
        DragDropInfo.dragObject = this.items.get(id);
    }

    tableOptionsClick(e) {
        e.stopImmediatePropagation();
        if (this.views.optionsDropdown) {
            this.hideOptionsDropdown();
            return;
        }
        const view = new DropdownView();
        this.listenTo(view, 'cancel', this.hideOptionsDropdown);
        this.listenTo(view, 'select', this.optionsDropdownSelect);
        const targetElRect = this.$el.find('.list__table-options')[0].getBoundingClientRect();
        const options = this.tableColumns.map(col => ({
            value: col.val,
            icon: col.enabled ? 'check-square-o' : 'square-o',
            text: StringFormat.capFirst(Locale[col.name])
        }));
        view.render({
            position: {
                top: targetElRect.bottom,
                left: targetElRect.left
            },
            options
        });
        this.views.optionsDropdown = view;
    }

    hideOptionsDropdown() {
        if (this.views.optionsDropdown) {
            this.views.optionsDropdown.remove();
            delete this.views.optionsDropdown;
        }
    }

    optionsDropdownSelect(e) {
        const col = _.find(this.tableColumns, c => c.val === e.item);
        col.enabled = !col.enabled;
        e.el.find('i:first').toggleClass('fa-check-square-o fa-square-o');
        this.render();
        this.saveTableColumnsEnabled();
    }

    readTableColumnsEnabled() {
        const tableViewColumns = AppSettingsModel.instance.get('tableViewColumns');
        if (tableViewColumns && tableViewColumns.length) {
            this.tableColumns.forEach(col => {
                col.enabled = tableViewColumns.indexOf(col.name) >= 0;
            });
        }
    }

    saveTableColumnsEnabled() {
        const tableViewColumns = this.tableColumns
            .filter(column => column.enabled)
            .map(column => column.name);
        AppSettingsModel.instance.set('tableViewColumns', tableViewColumns);
    }
}

Object.assign(ListView.prototype, Resizable);
Object.assign(ListView.prototype, Scrollable);

export { ListView };
