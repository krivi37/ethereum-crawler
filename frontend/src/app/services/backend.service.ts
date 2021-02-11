import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';


@Injectable({
  providedIn: 'root'
})
export class BackendService {

  constructor(private http: HttpClient) { }

  getTransactionFromBlockToLatest(blockNo, address) : Promise<any>{
    let headers = new HttpHeaders();
    headers = headers.append('Content-Type', 'application/json');
    return this.http.post('http://localhost:3000/gettransactionsfromblockno', {blockNo: blockNo, address: address}, { headers: headers }).toPromise();
  }

  getBalanceByDate(date, address) : Promise<any>{
    let headers = new HttpHeaders();
    headers = headers.append('Content-Type', 'application/json');
    return this.http.post('http://localhost:3000/getbalancebydate', {date: date, address: address}, { headers: headers }).toPromise();
  }

}
