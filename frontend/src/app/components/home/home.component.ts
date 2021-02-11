import { Component, OnInit } from '@angular/core';
import { BackendService } from 'src/app/services/backend.service';
import { PaginationModule } from 'ngx-bootstrap/pagination';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit {

  blockNo: string;
  address: string;
  selected_date: Date;
  showDateSearch: boolean;
  showBlockSearch: boolean;
  totalItems: any;
  pageSize: number;
  currentPage: number;
  itemsPerPage: number;

  transactions: Array<any>;
  token_balance: Array<any>;
  balance: string;
  isContract: boolean;
  balance_returned: boolean;
  transactions_returned: boolean;
  searching: boolean;
  select_page: number;
  error_msg: string;
  isError: boolean;
  transactions_number: number;

  constructor(private backend_service: BackendService) { }

  ngOnInit(): void {
    this.showDateSearch = false;
    this.showBlockSearch = false;
    this.itemsPerPage = 25;
    this.balance_returned = false;
    this.searching = false;
    this.currentPage = 1;
    this.selected_date = new Date();
  }

  changeCurrentPage(): void {
    this.currentPage = this.select_page;
  }

  getTransactionsByBlockNo() {
    if ((this.blockNo == undefined) || (this.address == undefined)) {
      return false;
    }
    this.transactions_returned = false;
    this.searching = true;
    this.error_msg = undefined;
    this.backend_service.getTransactionFromBlockToLatest(this.blockNo, this.address).then((data: any) => {
      if (data.success) {
        this.transactions = data.transactions;
        this.isContract = data.isContract;
        this.totalItems = this.transactions.length;
        this.transactions_returned = true;
        this.transactions_number = data.transactions.length;
      }
      else {
        this.error_msg = data.error;
      }
      this.searching = false;
    });
    return true;
  }

  getBalanceByDate() {
    if ((this.selected_date == undefined) || (this.address == undefined)) {
      return false;
    }
    this.error_msg = undefined;
    this.balance_returned = false;
    this.searching = true;
    this.backend_service.getBalanceByDate(this.selected_date, this.address).then((data: any) => {
      if (data.success) {
        this.balance = data.balance;
        this.isContract = data.isContract;
        this.token_balance = data.token_balance;
        this.balance_returned = true;
      }
      else {
        this.error_msg = data.error;
      }
      this.searching = false;
    });
    return true;
  }

  toggleDateSearch() {
    this.error_msg = undefined;
    this.showDateSearch = !this.showDateSearch;
  }

  toggleBlockSearch() {
    this.error_msg = undefined;
    this.showBlockSearch = !this.showBlockSearch;
  }

}
